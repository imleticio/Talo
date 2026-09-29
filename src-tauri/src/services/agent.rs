use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use futures_util::StreamExt;
use serde::Serialize;
use tokio::sync::{Mutex, Notify};

use crate::agents::{AgentAdapter, AgentEvent, AgentInfo};
use crate::database::{Database, ExternalSession};
use crate::errors::{AppError, AppResult};
use crate::models::{Message, MessageRole, MessageStatus};
use crate::services::persistence;

const PROVIDER: &str = "opencode";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentNotification {
    pub conversation_id: String,
    pub message_id: String,
    pub event: AgentEvent,
}

struct ActiveRun {
    message_id: String,
    cancelled: AtomicBool,
    cancel_signal: Notify,
    terminal: Mutex<()>,
}

pub struct AgentService {
    db: Database,
    adapter: Arc<dyn AgentAdapter>,
    sessions: Mutex<()>,
    runs: Mutex<HashMap<String, Arc<ActiveRun>>>,
}

impl AgentService {
    pub fn new(db: Database, adapter: Arc<dyn AgentAdapter>) -> Self {
        Self {
            db,
            adapter,
            sessions: Mutex::new(()),
            runs: Mutex::new(HashMap::new()),
        }
    }

    async fn storage<T: Send + 'static>(
        &self,
        operation: impl FnOnce(Database) -> AppResult<T> + Send + 'static,
    ) -> AppResult<T> {
        let db = self.db.clone();
        tokio::task::spawn_blocking(move || operation(db))
            .await
            .map_err(|_| AppError::new("storage", "Database task failed"))?
    }

    pub async fn status(&self) -> AppResult<AgentInfo> {
        self.adapter.info().await
    }

    pub async fn create_session(&self, conversation_id: String) -> AppResult<ExternalSession> {
        let _sessions = self.sessions.lock().await;
        let id = conversation_id.clone();
        let conversation = self
            .storage(move |db| persistence::get_conversation(&db, id))
            .await?;
        let id = conversation_id.clone();
        match self
            .storage(move |db| db.external_session(&id, PROVIDER))
            .await
        {
            Ok(_) => {
                return Err(AppError::new(
                    "constraint",
                    "Conversation already has an OpenCode session",
                ));
            }
            Err(error) if error.kind == "not_found" => {}
            Err(error) => return Err(error),
        }
        self.adapter.ensure_available().await?;
        let external_id = self.adapter.create_session(&conversation.title).await?;
        self.storage(move |db| db.link_session(&conversation_id, PROVIDER, &external_id))
            .await
    }

    pub async fn get_session(&self, conversation_id: String) -> AppResult<ExternalSession> {
        let session = self
            .storage(move |db| db.external_session(&conversation_id, PROVIDER))
            .await?;
        self.adapter.ensure_available().await?;
        let actual = self.adapter.get_session(&session.external_id).await?;
        if actual != session.external_id {
            return Err(AppError::new(
                "invalid_response",
                "OpenCode session ID mismatch",
            ));
        }
        Ok(session)
    }

    pub async fn send(
        &self,
        conversation_id: String,
        content: String,
        emit: impl Fn(AgentNotification) + Send + Sync,
    ) -> AppResult<Message> {
        if content.trim().is_empty() || content.contains('\0') {
            return Err(AppError::new("validation", "Invalid message content"));
        }
        let session = self.get_session(conversation_id.clone()).await?;
        let mut runs = self.runs.lock().await;
        if runs.contains_key(&conversation_id) {
            return Err(AppError::new(
                "busy",
                "Conversation already has an active run",
            ));
        }
        let events = self.adapter.events().await?;
        let id = conversation_id.clone();
        let prompt = content.clone();
        self.storage(move |db| {
            persistence::create_message(
                &db,
                id,
                MessageRole::User,
                content,
                MessageStatus::Completed,
            )
        })
        .await?;
        let id = conversation_id.clone();
        let draft = self
            .storage(move |db| {
                persistence::create_message(
                    &db,
                    id,
                    MessageRole::Assistant,
                    String::new(),
                    MessageStatus::Streaming,
                )
            })
            .await?;
        let run = Arc::new(ActiveRun {
            message_id: draft.id.clone(),
            cancelled: AtomicBool::new(false),
            cancel_signal: Notify::new(),
            terminal: Mutex::new(()),
        });
        runs.insert(conversation_id.clone(), run.clone());
        drop(runs);

        let message = draft.id.clone();
        emit(AgentNotification {
            conversation_id: conversation_id.clone(),
            message_id: message.clone(),
            event: AgentEvent::Started,
        });
        // The stream is subscribed before prompting so even very fast responses are observed.
        let result = async {
            tokio::select! {
                result = self.adapter.send_message(&session.external_id, &prompt) => result?,
                _ = run.cancel_signal.notified() => return Err(AppError::new("cancelled", "Run cancelled")),
            }
            self.consume(events, &session, &draft, &run, &emit).await
        }
        .await;
        let _terminal = run.terminal.lock().await;
        let result: AppResult<Message> = async {
            if run.cancelled.load(Ordering::SeqCst) {
                Err(AppError::new("cancelled", "OpenCode run was cancelled"))
            } else {
                match result {
                    Ok(text) if !text.trim().is_empty() => {
                        let id = draft.id.clone();
                        let finished = self
                            .storage(move |db| {
                                persistence::update_message(&db, id, text, MessageStatus::Completed)
                            })
                            .await?;
                        emit(AgentNotification {
                            conversation_id: session.conversation_id.clone(),
                            message_id: message.clone(),
                            event: AgentEvent::Completed,
                        });
                        Ok(finished)
                    }
                    outcome => {
                        let error = outcome.err().unwrap_or_else(|| {
                            AppError::new("invalid_response", "OpenCode returned an empty response")
                        });
                        let id = draft.id.clone();
                        let conversation = session.conversation_id.clone();
                        let text = self
                            .storage(move |db| persistence::list_messages(&db, conversation))
                            .await?
                            .into_iter()
                            .find(|item| item.id == id)
                            .map(|item| item.content)
                            .unwrap_or_default();
                        let id = draft.id.clone();
                        self.storage(move |db| {
                            persistence::update_message(&db, id, text, MessageStatus::Failed)
                        })
                        .await?;
                        emit(AgentNotification {
                            conversation_id: session.conversation_id.clone(),
                            message_id: message.clone(),
                            event: AgentEvent::Error {
                                message: error.message.clone(),
                            },
                        });
                        Err(error)
                    }
                }
            }
        }
        .await;
        self.runs.lock().await.remove(&session.conversation_id);
        result
    }

    async fn consume(
        &self,
        mut events: crate::agents::EventStream,
        session: &ExternalSession,
        draft: &Message,
        run: &ActiveRun,
        emit: &impl Fn(AgentNotification),
    ) -> AppResult<String> {
        let mut text = String::new();
        let mut parts: HashMap<String, String> = HashMap::new();
        let mut order = Vec::new();
        let mut assistant_id: Option<String> = None;
        let deadline = tokio::time::Instant::now() + Duration::from_secs(600);
        loop {
            if run.cancelled.load(Ordering::SeqCst) {
                return Err(AppError::new("cancelled", "Run cancelled"));
            }
            let next = tokio::select! {
                _ = run.cancel_signal.notified() => return Err(AppError::new("cancelled", "Run cancelled")),
                result = tokio::time::timeout_at(deadline, tokio::time::timeout(Duration::from_secs(120), events.next())) => {
                    result.map_err(|_| AppError::new("timeout", "OpenCode run timed out"))?
                        .map_err(|_| AppError::new("timeout", "OpenCode stopped sending events"))?
                        .ok_or_else(|| AppError::new("unavailable", "OpenCode event stream disconnected"))??
                }
            };
            if next.session_id != session.external_id {
                continue;
            }
            if let AgentEvent::Started = next.event {
                assistant_id = next.message_id;
                continue;
            }
            match next.event {
                AgentEvent::Delta { text: value }
                    if assistant_id.as_deref() == next.message_id.as_deref()
                        && assistant_id.is_some() =>
                {
                    let id = next.part_id.unwrap_or_else(|| "text".to_owned());
                    if !parts.contains_key(&id) {
                        order.push(id.clone());
                    }
                    let part = parts.entry(id).or_default();
                    if next.snapshot {
                        *part = value;
                    } else {
                        part.push_str(&value);
                    }
                    let current = order
                        .iter()
                        .filter_map(|id| parts.get(id))
                        .cloned()
                        .collect::<String>();
                    if current != text {
                        let delta = current.strip_prefix(&text).unwrap_or(&current).to_owned();
                        text = current;
                        let id = draft.id.clone();
                        let updated = text.clone();
                        self.storage(move |db| {
                            persistence::update_message(&db, id, updated, MessageStatus::Streaming)
                        })
                        .await?;
                        emit(AgentNotification {
                            conversation_id: session.conversation_id.clone(),
                            message_id: draft.id.clone(),
                            event: AgentEvent::Delta { text: delta },
                        });
                    }
                }
                AgentEvent::Tool { .. }
                    if assistant_id.as_deref() == next.message_id.as_deref() =>
                {
                    emit(AgentNotification {
                        conversation_id: session.conversation_id.clone(),
                        message_id: draft.id.clone(),
                        event: next.event,
                    })
                }
                AgentEvent::Completed => return Ok(text),
                AgentEvent::Error { message } => return Err(AppError::new("unavailable", message)),
                _ => {}
            }
        }
    }

    pub async fn cancel(
        &self,
        conversation_id: String,
        emit: impl Fn(AgentNotification),
    ) -> AppResult<()> {
        let run = self
            .runs
            .lock()
            .await
            .get(&conversation_id)
            .cloned()
            .ok_or_else(|| AppError::new("not_found", "No active run"))?;
        let _terminal = run.terminal.lock().await;
        if !self.runs.lock().await.contains_key(&conversation_id) {
            return Err(AppError::new("not_found", "No active run"));
        }
        run.cancelled.store(true, Ordering::SeqCst);
        run.cancel_signal.notify_one();
        let conversation = conversation_id.clone();
        let result = match self
            .storage(move |db| db.external_session(&conversation, PROVIDER))
            .await
        {
            Ok(session) => self.adapter.cancel(&session.external_id).await,
            Err(error) => Err(error),
        };
        let id = run.message_id.clone();
        let conversation = conversation_id.clone();
        let content = self
            .storage(move |db| {
                Ok(persistence::list_messages(&db, conversation)?
                    .into_iter()
                    .find(|message| message.id == id)
                    .ok_or_else(|| AppError::new("not_found", "Message not found"))?
                    .content)
            })
            .await?;
        let id = run.message_id.clone();
        let status = if result.is_ok() {
            MessageStatus::Interrupted
        } else {
            MessageStatus::Failed
        };
        self.storage(move |db| persistence::update_message(&db, id, content, status))
            .await?;
        emit(AgentNotification {
            conversation_id: conversation_id.clone(),
            message_id: run.message_id.clone(),
            event: if result.is_ok() {
                AgentEvent::Cancelled
            } else {
                AgentEvent::Error {
                    message: "OpenCode cancellation failed".to_owned(),
                }
            },
        });
        self.runs.lock().await.remove(&conversation_id);
        result
    }
}
