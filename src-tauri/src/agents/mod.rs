pub mod opencode;

use std::pin::Pin;

use async_trait::async_trait;
use futures_util::Stream;
use serde::Serialize;

use crate::errors::AppResult;

pub type EventStream = Pin<Box<dyn Stream<Item = AppResult<AgentUpdate>> + Send>>;

pub struct AgentUpdate {
    pub session_id: String,
    pub message_id: Option<String>,
    pub part_id: Option<String>,
    pub snapshot: bool,
    pub event: AgentEvent,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AgentEvent {
    Started,
    Delta { text: String },
    Tool { name: String, state: String },
    Completed,
    Error { message: String },
    Cancelled,
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

#[async_trait]
pub trait AgentAdapter: Send + Sync {
    async fn info(&self) -> AppResult<AgentInfo>;
    async fn ensure_available(&self) -> AppResult<()>;
    async fn create_session(&self, title: &str) -> AppResult<String>;
    async fn get_session(&self, id: &str) -> AppResult<String>;
    async fn send_message(&self, session: &str, content: &str) -> AppResult<()>;
    async fn cancel(&self, session: &str) -> AppResult<()>;
    async fn events(&self) -> AppResult<EventStream>;
    async fn shutdown(&self) -> AppResult<()>;
}
