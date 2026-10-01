pub mod opencode;

use std::pin::Pin;

use async_trait::async_trait;
use futures_util::Stream;
use serde::{Deserialize, Serialize};

use crate::errors::AppResult;

pub type EventStream = Pin<Box<dyn Stream<Item = AppResult<AgentUpdate>> + Send>>;

pub struct AgentUpdate {
    pub session_id: String,
    pub message_id: Option<String>,
    pub part_id: Option<String>,
    pub snapshot: bool,
    pub response_model: Option<(String, String)>,
    pub event: AgentEvent,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AgentEvent {
    Started,
    Delta {
        text: String,
    },
    Tool {
        id: String,
        name: String,
        state: String,
        action: String,
        title: String,
        path: Option<String>,
        command: Option<String>,
        output: Option<String>,
        #[serde(rename = "exitCode")]
        exit_code: Option<i64>,
        files: Vec<String>,
    },
    Tasks {
        tasks: Vec<AgentTask>,
    },
    Status {
        text: String,
    },
    Attention {
        id: String,
        title: String,
        detail: Option<String>,
    },
    AttentionResolved {
        id: String,
    },
    FilesChanged {
        files: Vec<String>,
    },
    Completed,
    Error {
        message: String,
    },
    Cancelled,
}

#[derive(Debug, Clone, Serialize)]
pub struct AgentTask {
    pub id: String,
    pub label: String,
    pub state: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentInfo {
    pub name: &'static str,
    pub installed: bool,
    pub available: bool,
    pub version: Option<String>,
    pub endpoint: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentModel {
    pub provider_id: String,
    pub provider_name: String,
    pub model_id: String,
    pub name: String,
    pub variants: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentModelChoice {
    pub provider_id: String,
    pub model_id: String,
    pub variant: Option<String>,
}

#[async_trait]
pub trait AgentAdapter: Send + Sync {
    async fn info(&self) -> AppResult<AgentInfo>;
    async fn ensure_available(&self) -> AppResult<()>;
    async fn models(&self) -> AppResult<Vec<AgentModel>>;
    async fn create_session(&self, title: &str) -> AppResult<String>;
    async fn get_session(&self, id: &str) -> AppResult<String>;
    async fn send_message(
        &self,
        session: &str,
        content: &str,
        model: Option<&AgentModelChoice>,
    ) -> AppResult<()>;
    async fn cancel(&self, session: &str) -> AppResult<()>;
    async fn events(&self) -> AppResult<EventStream>;
    async fn shutdown(&self) -> AppResult<()>;
}
