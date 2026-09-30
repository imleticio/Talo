use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::sse::{Event, Sse};
use axum::routing::{get, post};
use axum::{Json, Router};
use futures_util::{Stream, StreamExt};
use serde_json::{Value, json};
use talo_lib::agents::opencode::{OpenCodeAdapter, OpenCodeClient};
use talo_lib::agents::{AgentAdapter, AgentEvent, AgentModelChoice};
use talo_lib::database::Database;
use talo_lib::models::MessageStatus;
use talo_lib::services::{agent::AgentService, persistence};
use tempfile::tempdir;
use tokio::sync::{Mutex, broadcast};

struct Mock {
    events: broadcast::Sender<String>,
    slow: AtomicBool,
    fail: AtomicBool,
    missing: AtomicBool,
    abort_called: AtomicBool,
    silent_abort: AtomicBool,
    malformed: AtomicBool,
    expect_model: AtomicBool,
    response_model: Mutex<Value>,
}

async fn health() -> Json<Value> {
    Json(json!({"healthy": true, "version": "1.18.32"}))
}
async fn providers() -> Json<Value> {
    Json(json!({
        "all": [
            {"id": "opencode", "name": "OpenCode Zen", "models": {
                "free-model": {"name": "Free Model", "variants": {"high": {}, "low": {}, "disabled": {"disabled": true}}}
            }},
            {"id": "unconnected", "name": "Unavailable", "models": {
                "other": {"name": "Other"}
            }}
        ],
        "connected": ["opencode"]
    }))
}
async fn create(State(state): State<Arc<Mock>>) -> Json<Value> {
    if state.malformed.load(Ordering::SeqCst) {
        Json(json!({"wrong": true}))
    } else {
        Json(json!({"id": "ses_mock"}))
    }
}
async fn get_session(
    State(state): State<Arc<Mock>>,
    Path(id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    if id == "ses_mock" && !state.missing.load(Ordering::SeqCst) {
        Ok(Json(json!({"id": id})))
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}
async fn prompt(State(state): State<Arc<Mock>>, Json(body): Json<Value>) -> StatusCode {
    assert_eq!(body["parts"][0]["text"], "hello");
    if state.expect_model.load(Ordering::SeqCst) {
        assert_eq!(
            body["model"],
            json!({"providerID": "opencode", "modelID": "free-model"})
        );
        assert_eq!(body["variant"], "high");
    } else {
        assert!(body.get("model").is_none());
    }
    let model = state.response_model.lock().await.clone();
    let mut info = json!({"id":"msg_mock","sessionID":"ses_mock","role":"assistant"});
    if let Some(fields) = model.as_object() {
        info.as_object_mut().unwrap().extend(fields.clone());
    }
    let events = [
        json!({"type":"message.updated","properties":{"info":info}}),
        json!({"type":"message.part.delta","properties":{"sessionID":"ses_mock","messageID":"msg_mock","partID":"part_1","field":"text","delta":"Hello"}}),
        json!({"type":"message.part.updated","properties":{"part":{"id":"part_1","sessionID":"ses_mock","messageID":"msg_mock","type":"text","text":"Hello world"}}}),
        json!({"type":"message.updated","properties":{"info":info}}),
        json!({"type":"message.updated","properties":{"info":{"id":"unrelated","sessionID":"other_session","role":"assistant","providerID":"wrong","modelID":"wrong"}}}),
        json!({"type":"message.updated","properties":{"info":{"id":"user","sessionID":"ses_mock","role":"user","providerID":"wrong","modelID":"wrong"}}}),
    ];
    for event in events {
        let _ = state.events.send(event.to_string());
    }
    if state.fail.load(Ordering::SeqCst) {
        let _ = state.events.send(json!({"type":"session.error","properties":{"sessionID":"ses_mock","error":{"data":{"message":"model unavailable"}}}}).to_string());
    } else if !state.slow.load(Ordering::SeqCst) {
        let _ = state
            .events
            .send(json!({"type":"session.idle","properties":{"sessionID":"ses_mock"}}).to_string());
    }
    StatusCode::NO_CONTENT
}
async fn abort(State(state): State<Arc<Mock>>) -> Json<bool> {
    state.abort_called.store(true, Ordering::SeqCst);
    if !state.silent_abort.load(Ordering::SeqCst) {
        let _ = state
            .events
            .send(json!({"type":"session.idle","properties":{"sessionID":"ses_mock"}}).to_string());
    }
    Json(true)
}
async fn events(
    State(state): State<Arc<Mock>>,
) -> Sse<impl Stream<Item = Result<Event, std::convert::Infallible>>> {
    let mut receiver = state.events.subscribe();
    let stream = async_stream::stream! {
        yield Ok(Event::default().data(json!({"type":"server.connected","properties":{}}).to_string()));
        while let Ok(event) = receiver.recv().await { yield Ok(Event::default().data(event)); }
    };
    Sse::new(stream)
}

async fn server() -> (String, Arc<Mock>, tokio::task::JoinHandle<()>) {
    let (sender, _) = broadcast::channel(64);
    let state = Arc::new(Mock {
        events: sender,
        slow: AtomicBool::new(false),
        fail: AtomicBool::new(false),
        missing: AtomicBool::new(false),
        abort_called: AtomicBool::new(false),
        silent_abort: AtomicBool::new(false),
        malformed: AtomicBool::new(false),
        expect_model: AtomicBool::new(false),
        response_model: Mutex::new(json!({"providerID":"opencode","modelID":"free-model"})),
    });
    let router = Router::new()
        .route("/global/health", get(health))
        .route("/provider", get(providers))
        .route("/session", post(create))
        .route("/session/{id}", get(get_session))
        .route("/session/{id}/prompt_async", post(prompt))
        .route("/session/{id}/abort", post(abort))
        .route("/event", get(events))
        .with_state(state.clone());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let task = tokio::spawn(async move {
        axum::serve(listener, router).await.unwrap();
    });
    (url, state, task)
}

#[tokio::test]
async fn sends_streaming_reply_and_recovers_external_session_after_restart() {
    let dir = tempdir().unwrap();
    let (url, _, server) = server().await;
    let db = Database::initialize(dir.path()).unwrap();
    let conversation = persistence::create_conversation(&db, None, "Workspace".into()).unwrap();
    let adapter =
        Arc::new(OpenCodeAdapter::with_endpoint(dir.path().to_path_buf(), url.clone()).unwrap());
    let service = AgentService::new(db.clone(), adapter);
    let info = service.status().await.unwrap();
    assert!(info.available);
    assert_eq!(info.version.as_deref(), Some("1.18.32"));
    assert_eq!(
        service
            .create_session(conversation.id.clone())
            .await
            .unwrap()
            .external_id,
        "ses_mock"
    );
    assert_eq!(
        service
            .create_session(conversation.id.clone())
            .await
            .unwrap_err()
            .kind,
        "constraint"
    );
    let result = service
        .send(conversation.id.clone(), "hello".into(), None, |_| {})
        .await
        .unwrap();
    assert_eq!(result.content, "Hello world");
    assert_eq!(result.status, MessageStatus::Completed);
    let messages = persistence::list_messages(&db, conversation.id.clone()).unwrap();
    assert_eq!(messages.len(), 2);
    assert_eq!(messages[0].content, "hello");
    assert_eq!(messages[1].content, "Hello world");
    drop(service);
    drop(db);
    let db = Database::initialize(dir.path()).unwrap();
    let restarted = AgentService::new(
        db,
        Arc::new(OpenCodeAdapter::with_endpoint(dir.path().to_path_buf(), url).unwrap()),
    );
    assert_eq!(
        restarted
            .get_session(conversation.id)
            .await
            .unwrap()
            .external_id,
        "ses_mock"
    );
    server.abort();
}

#[tokio::test]
async fn aborts_running_session_and_preserves_partial_message() {
    let dir = tempdir().unwrap();
    let (url, mock, server) = server().await;
    mock.slow.store(true, Ordering::SeqCst);
    mock.silent_abort.store(true, Ordering::SeqCst);
    let db = Database::initialize(dir.path()).unwrap();
    let conversation = persistence::create_conversation(&db, None, "Cancel".into()).unwrap();
    let service = Arc::new(AgentService::new(
        db.clone(),
        Arc::new(OpenCodeAdapter::with_endpoint(dir.path().to_path_buf(), url).unwrap()),
    ));
    service
        .create_session(conversation.id.clone())
        .await
        .unwrap();
    let (updates, mut received) = tokio::sync::mpsc::unbounded_channel();
    let running = service.clone();
    let id = conversation.id.clone();
    let task = tokio::spawn(async move {
        running
            .send(id, "hello".into(), None, move |event| {
                let _ = updates.send(event.event);
            })
            .await
    });
    tokio::time::timeout(std::time::Duration::from_secs(5), async {
        while let Some(event) = received.recv().await {
            if matches!(event, AgentEvent::Delta { .. }) {
                break;
            }
        }
    })
    .await
    .unwrap();
    service
        .cancel(conversation.id.clone(), |_| {})
        .await
        .unwrap();
    assert_eq!(
        tokio::time::timeout(std::time::Duration::from_secs(2), task)
            .await
            .unwrap()
            .unwrap()
            .unwrap_err()
            .kind,
        "cancelled"
    );
    assert!(mock.abort_called.load(Ordering::SeqCst));
    let messages = persistence::list_messages(&db, conversation.id).unwrap();
    assert_eq!(messages[1].status, MessageStatus::Interrupted);
    assert!(!messages[1].content.is_empty());
    server.abort();
}

#[tokio::test]
async fn reports_invalid_response_missing_session_and_refused_connections() {
    let dir = tempdir().unwrap();
    let (url, mock, server) = server().await;
    mock.malformed.store(true, Ordering::SeqCst);
    let db = Database::initialize(dir.path()).unwrap();
    let conversation = persistence::create_conversation(&db, None, "Invalid".into()).unwrap();
    let service = AgentService::new(
        db,
        Arc::new(OpenCodeAdapter::with_endpoint(dir.path().to_path_buf(), url).unwrap()),
    );
    assert_eq!(
        service
            .create_session(conversation.id.clone())
            .await
            .unwrap_err()
            .kind,
        "invalid_response"
    );
    assert_eq!(
        service.get_session(conversation.id).await.unwrap_err().kind,
        "not_found"
    );
    server.abort();

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    drop(listener);
    let client = OpenCodeClient::new(url, dir.path().to_str().unwrap()).unwrap();
    assert_eq!(
        client.health().await.unwrap_err().kind,
        "connection_refused"
    );
    assert_eq!(
        OpenCodeClient::new("http://example.com:4096".into(), "/tmp")
            .err()
            .unwrap()
            .kind,
        "validation"
    );
}

#[tokio::test]
async fn remote_errors_preserve_draft_and_missing_remote_sessions_are_reported() {
    let dir = tempdir().unwrap();
    let (url, mock, server) = server().await;
    let db = Database::initialize(dir.path()).unwrap();
    let conversation = persistence::create_conversation(&db, None, "Failure".into()).unwrap();
    let service = AgentService::new(
        db.clone(),
        Arc::new(OpenCodeAdapter::with_endpoint(dir.path().to_path_buf(), url).unwrap()),
    );
    service
        .create_session(conversation.id.clone())
        .await
        .unwrap();
    mock.fail.store(true, Ordering::SeqCst);
    assert_eq!(
        service
            .send(conversation.id.clone(), "hello".into(), None, |_| {})
            .await
            .unwrap_err()
            .kind,
        "unavailable"
    );
    let messages = persistence::list_messages(&db, conversation.id.clone()).unwrap();
    assert_eq!(messages[1].status, MessageStatus::Failed);
    assert_eq!(messages[1].content, "Hello world");
    mock.missing.store(true, Ordering::SeqCst);
    assert_eq!(
        service.get_session(conversation.id).await.unwrap_err().kind,
        "session_not_found"
    );
    server.abort();
}

#[tokio::test]
async fn lists_connected_models_and_sends_selected_variant() {
    let dir = tempdir().unwrap();
    let (url, mock, server) = server().await;
    mock.expect_model.store(true, Ordering::SeqCst);
    *mock.response_model.lock().await =
        json!({"providerID":"resolved-provider","modelID":"actual-model"});
    let db = Database::initialize(dir.path()).unwrap();
    let conversation = persistence::create_conversation(&db, None, "Models".into()).unwrap();
    let service = AgentService::new(
        db.clone(),
        Arc::new(OpenCodeAdapter::with_endpoint(dir.path().to_path_buf(), url).unwrap()),
    );
    let models = service.models().await.unwrap();
    assert_eq!(models.len(), 1);
    assert_eq!(models[0].name, "Free Model");
    assert_eq!(models[0].variants, ["high", "low"]);
    service
        .create_session(conversation.id.clone())
        .await
        .unwrap();
    let selected = AgentModelChoice {
        provider_id: "opencode".into(),
        model_id: "free-model".into(),
        variant: Some("high".into()),
    };
    let answer = service
        .send(
            conversation.id.clone(),
            "hello".into(),
            Some(selected),
            |_| {},
        )
        .await
        .unwrap();
    assert_eq!(answer.content, "Hello world");
    let saved = persistence::get_conversation(&db, conversation.id.clone()).unwrap();
    assert_eq!(saved.last_provider_id.as_deref(), Some("resolved-provider"));
    assert_eq!(saved.last_model_id.as_deref(), Some("actual-model"));
    let invalid = AgentModelChoice {
        provider_id: "unconnected".into(),
        model_id: "other".into(),
        variant: None,
    };
    assert_eq!(
        service
            .send(
                conversation.id.clone(),
                "hello".into(),
                Some(invalid),
                |_| {}
            )
            .await
            .unwrap_err()
            .kind,
        "validation"
    );
    let invalid_variant = AgentModelChoice {
        provider_id: "opencode".into(),
        model_id: "free-model".into(),
        variant: Some("unknown".into()),
    };
    assert_eq!(
        service
            .send(
                conversation.id.clone(),
                "hello".into(),
                Some(invalid_variant),
                |_| {}
            )
            .await
            .unwrap_err()
            .kind,
        "validation"
    );
    assert_eq!(
        persistence::list_messages(&db, conversation.id)
            .unwrap()
            .len(),
        2
    );
    server.abort();
}

#[tokio::test]
async fn saves_actual_default_and_changed_response_model_without_guessing_missing_metadata() {
    let dir = tempdir().unwrap();
    let (url, mock, server) = server().await;
    let db = Database::initialize(dir.path()).unwrap();
    let conversation = persistence::create_conversation(&db, None, "Models".into()).unwrap();
    let other = persistence::create_conversation(&db, None, "Other".into()).unwrap();
    db.set_conversation_model(&other.id, Some(&("existing".into(), "existing".into())))
        .unwrap();
    let connection = rusqlite::Connection::open(dir.path().join("talo.db")).unwrap();
    connection
        .execute_batch(
            "CREATE TABLE model_writes (id INTEGER);
         CREATE TRIGGER count_model_writes AFTER UPDATE OF last_model_id ON conversations
         BEGIN INSERT INTO model_writes VALUES (1); END;",
        )
        .unwrap();
    let service = AgentService::new(
        db.clone(),
        Arc::new(OpenCodeAdapter::with_endpoint(dir.path().to_path_buf(), url).unwrap()),
    );
    service
        .create_session(conversation.id.clone())
        .await
        .unwrap();
    for (metadata, expected) in [
        (
            json!({"providerID":"opencode","modelID":"free-model"}),
            Some(("opencode", "free-model")),
        ),
        (
            json!({"providerID":"resolved-provider","modelID":"next-model"}),
            Some(("resolved-provider", "next-model")),
        ),
        (Value::Null, None),
        (json!({"providerID":"incomplete"}), None),
    ] {
        *mock.response_model.lock().await = metadata;
        service
            .send(conversation.id.clone(), "hello".into(), None, |_| {})
            .await
            .unwrap();
        let saved = persistence::get_conversation(&db, conversation.id.clone()).unwrap();
        assert_eq!(
            saved.last_provider_id.as_deref(),
            expected.map(|value| value.0)
        );
        assert_eq!(
            saved.last_model_id.as_deref(),
            expected.map(|value| value.1)
        );
        let untouched = persistence::get_conversation(&db, other.id.clone()).unwrap();
        assert_eq!(untouched.last_model_id.as_deref(), Some("existing"));
    }
    let writes: u32 = connection
        .query_row("SELECT COUNT(*) FROM model_writes", [], |row| row.get(0))
        .unwrap();
    assert_eq!(
        writes, 4,
        "duplicate stream updates must not rewrite metadata"
    );
    server.abort();
}

// Optional local smoke check; the normal suite never requires an installed agent.
#[tokio::test]
#[ignore = "requires locally installed OpenCode"]
async fn real_opencode_can_start_and_create_a_session() {
    let dir = tempdir().unwrap();
    let adapter = OpenCodeAdapter::new(dir.path().to_path_buf()).unwrap();
    adapter.ensure_available().await.unwrap();
    assert!(!adapter.models().await.unwrap().is_empty());
    let info = adapter.info().await.unwrap();
    assert!(info.available);
    let client = OpenCodeClient::new(info.endpoint.unwrap(), dir.path().to_str().unwrap()).unwrap();
    let mut events = client.events().await.unwrap();
    let connected = tokio::time::timeout(std::time::Duration::from_secs(3), events.next())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert_eq!(connected.kind, "server.connected");
    let session = adapter.create_session("Talo smoke test").await.unwrap();
    assert_eq!(adapter.get_session(&session).await.unwrap(), session);
    adapter.shutdown().await.unwrap();
    let restarted = OpenCodeAdapter::new(dir.path().to_path_buf()).unwrap();
    restarted.ensure_available().await.unwrap();
    assert_eq!(restarted.get_session(&session).await.unwrap(), session);
    restarted.shutdown().await.unwrap();
}

#[tokio::test]
#[ignore = "requires installed OpenCode with a configured model and credentials"]
async fn real_opencode_prompt_reaches_sqlite() {
    let dir = tempdir().unwrap();
    let db = Database::initialize(dir.path()).unwrap();
    let conversation = persistence::create_conversation(&db, None, "Live OpenCode".into()).unwrap();
    let service = Arc::new(AgentService::new(
        db.clone(),
        Arc::new(OpenCodeAdapter::new(dir.path().to_path_buf()).unwrap()),
    ));
    service
        .create_session(conversation.id.clone())
        .await
        .unwrap();
    let model = service
        .models()
        .await
        .unwrap()
        .into_iter()
        .find(|model| model.provider_id == "opencode" && model.model_id == "big-pickle")
        .expect("The configured OpenCode Zen Big Pickle model is required for the live test");
    let selected = AgentModelChoice {
        provider_id: model.provider_id,
        model_id: model.model_id,
        variant: None,
    };
    let running = service.clone();
    let id = conversation.id.clone();
    let task = tokio::spawn(async move {
        running
            .send(
                id,
                "Reply with the word hello. Do not use tools.".into(),
                Some(selected),
                |_| {},
            )
            .await
    });
    let answer = match tokio::time::timeout(std::time::Duration::from_secs(45), task).await {
        Ok(result) => result.unwrap().unwrap(),
        Err(_) => {
            let _ = service.cancel(conversation.id.clone(), |_| {}).await;
            panic!("OpenCode prompt did not finish within 45 seconds");
        }
    };
    assert_eq!(answer.status, MessageStatus::Completed);
    assert!(!answer.content.trim().is_empty());
    let saved = persistence::list_messages(&db, conversation.id).unwrap();
    assert_eq!(saved.len(), 2);
    assert_eq!(saved[1].content, answer.content);
}
