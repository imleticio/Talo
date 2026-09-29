mod client;
mod types;

pub use client::OpenCodeClient;
pub use types::Event;

use std::path::PathBuf;
use std::time::Duration;

use async_trait::async_trait;
use futures_util::StreamExt;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use crate::agents::{
    AgentAdapter, AgentEvent, AgentInfo, AgentModel, AgentModelChoice, AgentUpdate, EventStream,
};
use crate::errors::{AppError, AppResult};

const DEFAULT_ENDPOINT: &str = "http://127.0.0.1:4096";

pub struct OpenCodeAdapter {
    client: Mutex<OpenCodeClient>,
    child: Mutex<Option<Child>>,
    directory: PathBuf,
}

impl OpenCodeAdapter {
    pub fn new(directory: PathBuf) -> AppResult<Self> {
        let endpoint =
            std::env::var("TALO_OPENCODE_ENDPOINT").unwrap_or_else(|_| DEFAULT_ENDPOINT.to_owned());
        Self::with_endpoint(directory, endpoint)
    }

    pub fn with_endpoint(directory: PathBuf, endpoint: String) -> AppResult<Self> {
        let path = directory
            .to_str()
            .ok_or_else(|| AppError::new("validation", "Invalid workspace path"))?;
        Ok(Self {
            client: Mutex::new(OpenCodeClient::new(endpoint, path)?),
            child: Mutex::new(None),
            directory,
        })
    }

    async fn client(&self) -> OpenCodeClient {
        self.client.lock().await.clone()
    }

    async fn binary_version() -> Option<String> {
        let output = tokio::time::timeout(
            Duration::from_secs(3),
            Command::new("opencode").arg("--version").output(),
        )
        .await
        .ok()?
        .ok()?;
        if output.status.success() {
            String::from_utf8(output.stdout)
                .ok()
                .map(|version| version.trim().to_owned())
                .filter(|version| !version.is_empty())
        } else {
            None
        }
    }
}

#[async_trait]
impl AgentAdapter for OpenCodeAdapter {
    async fn models(&self) -> AppResult<Vec<AgentModel>> {
        self.client().await.models().await
    }
    async fn info(&self) -> AppResult<AgentInfo> {
        let installed_version = Self::binary_version().await;
        let client = self.client().await;
        let health = client.health().await.ok().filter(|health| health.healthy);
        Ok(AgentInfo {
            name: "OpenCode",
            installed: installed_version.is_some(),
            available: health.is_some(),
            version: health
                .as_ref()
                .map(|health| health.version.clone())
                .or(installed_version),
            endpoint: health.map(|_| client.endpoint().to_owned()),
        })
    }

    async fn ensure_available(&self) -> AppResult<()> {
        match self.client().await.health().await {
            Ok(health) if health.healthy => return Ok(()),
            Err(error) if error.kind == "authentication" => return Err(error),
            _ => {}
        }
        let mut child = self.child.lock().await;
        if let Some(process) = child.as_mut()
            && process
                .try_wait()
                .map_err(|_| AppError::new("process_exited", "OpenCode process exited"))?
                .is_none()
        {
            return Err(AppError::new(
                "unavailable",
                "OpenCode server is not responding",
            ));
        }
        if Self::binary_version().await.is_none() {
            return Err(AppError::new(
                "not_installed",
                "OpenCode is not available on PATH",
            ));
        }
        // Reserve a loopback port; the child only receives fixed, validated arguments.
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|_| AppError::new("unavailable", "Could not reserve a local port"))?;
        let port = listener
            .local_addr()
            .map_err(|_| AppError::new("unavailable", "Could not select a local port"))?
            .port();
        drop(listener);
        let endpoint = format!("http://127.0.0.1:{port}");
        let client = OpenCodeClient::new(
            endpoint,
            self.directory
                .to_str()
                .ok_or_else(|| AppError::new("validation", "Invalid workspace path"))?,
        )?;
        let process = Command::new("opencode")
            .args([
                "serve",
                "--hostname",
                "127.0.0.1",
                "--port",
                &port.to_string(),
            ])
            .current_dir(&self.directory)
            .kill_on_drop(true)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|_| AppError::new("process_exited", "Could not start OpenCode"))?;
        *child = Some(process);
        for _ in 0..50 {
            if client.health().await.is_ok_and(|health| health.healthy) {
                *self.client.lock().await = client;
                return Ok(());
            }
            if child
                .as_mut()
                .is_some_and(|process| process.try_wait().ok().flatten().is_some())
            {
                return Err(AppError::new(
                    "process_exited",
                    "OpenCode exited during startup",
                ));
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        child.as_mut().unwrap().start_kill().ok();
        Err(AppError::new("timeout", "OpenCode did not start in time"))
    }

    async fn create_session(&self, title: &str) -> AppResult<String> {
        self.client().await.create_session(title).await
    }
    async fn get_session(&self, id: &str) -> AppResult<String> {
        self.client().await.get_session(id).await
    }
    async fn send_message(
        &self,
        session: &str,
        content: &str,
        model: Option<&AgentModelChoice>,
    ) -> AppResult<()> {
        self.client().await.prompt(session, content, model).await
    }
    async fn cancel(&self, session: &str) -> AppResult<()> {
        self.client().await.abort(session).await
    }

    async fn events(&self) -> AppResult<EventStream> {
        let stream = self
            .client()
            .await
            .events()
            .await?
            .filter_map(|event| async move {
                match event {
                    Ok(event) => map_event(event).map(Ok),
                    Err(error) => Some(Err(error)),
                }
            });
        Ok(Box::pin(stream))
    }

    async fn shutdown(&self) -> AppResult<()> {
        if let Some(mut child) = self.child.lock().await.take() {
            child
                .kill()
                .await
                .map_err(|_| AppError::new("process_exited", "Could not stop OpenCode"))?;
        }
        Ok(())
    }
}

fn map_event(event: Event) -> Option<AgentUpdate> {
    let session_id = event.session_id()?.to_owned();
    let message_id = event.message_id().map(str::to_owned);
    let part_id = event
        .properties
        .get("part")
        .and_then(|part| part.get("id"))
        .or_else(|| event.properties.get("partID"))
        .and_then(serde_json::Value::as_str)
        .map(str::to_owned);
    let (event, snapshot) = match event.kind.as_str() {
        "message.updated"
            if event.properties.get("info")?.get("role")?.as_str()? == "assistant" =>
        {
            (AgentEvent::Started, false)
        }
        "message.part.delta" if event.properties.get("field")?.as_str()? == "text" => (
            AgentEvent::Delta {
                text: event.properties.get("delta")?.as_str()?.to_owned(),
            },
            false,
        ),
        "message.part.updated"
            if event.properties.get("part")?.get("type")?.as_str()? == "text" =>
        {
            (
                AgentEvent::Delta {
                    text: event
                        .properties
                        .get("part")?
                        .get("text")?
                        .as_str()?
                        .to_owned(),
                },
                true,
            )
        }
        _ => (event.mapped()?, false),
    };
    Some(AgentUpdate {
        session_id,
        message_id,
        part_id,
        snapshot,
        event,
    })
}
