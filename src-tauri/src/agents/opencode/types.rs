use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;

use crate::agents::AgentEvent;
use crate::errors::{AppError, AppResult};

#[derive(Debug, Deserialize)]
pub struct Health {
    pub healthy: bool,
    pub version: String,
}

#[derive(Deserialize)]
pub struct Session {
    pub id: String,
}

#[derive(Deserialize)]
pub struct Providers {
    pub all: Vec<Provider>,
    pub connected: Vec<String>,
}

#[derive(Deserialize)]
pub struct Provider {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub models: HashMap<String, ProviderModel>,
}

#[derive(Deserialize)]
pub struct ProviderModel {
    pub name: String,
    #[serde(default)]
    pub variants: HashMap<String, Value>,
}

#[derive(Debug, Deserialize)]
pub struct Event {
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub properties: Value,
}

impl Event {
    pub fn session_id(&self) -> Option<&str> {
        self.properties
            .get("sessionID")
            .or_else(|| self.properties.get("info")?.get("sessionID"))
            .or_else(|| self.properties.get("part")?.get("sessionID"))
            .and_then(Value::as_str)
    }

    pub fn message_id(&self) -> Option<&str> {
        self.properties
            .get("messageID")
            .or_else(|| self.properties.get("part")?.get("messageID"))
            .or_else(|| self.properties.get("info")?.get("id"))
            .and_then(Value::as_str)
    }

    pub fn mapped(&self) -> Option<AgentEvent> {
        match self.kind.as_str() {
            "session.error" => Some(AgentEvent::Error {
                message: self
                    .properties
                    .get("error")?
                    .get("data")?
                    .get("message")?
                    .as_str()?
                    .to_owned(),
            }),
            "session.idle" => Some(AgentEvent::Completed),
            "message.part.updated"
                if self.properties.get("part")?.get("type")?.as_str()? == "tool" =>
            {
                let part = self.properties.get("part")?;
                Some(AgentEvent::Tool {
                    name: part.get("tool")?.as_str()?.to_owned(),
                    state: part.get("state")?.get("status")?.as_str()?.to_owned(),
                })
            }
            _ => None,
        }
    }
}

pub fn parse_sse(frame: &str) -> AppResult<Option<Event>> {
    let data = frame
        .lines()
        .filter_map(|line| line.strip_prefix("data:").map(str::trim_start))
        .collect::<Vec<_>>()
        .join("\n");
    if data.is_empty() || data == "[DONE]" {
        return Ok(None);
    }
    serde_json::from_str::<Event>(&data)
        .map(Some)
        .map_err(|_| AppError::new("invalid_response", "Invalid OpenCode event"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_opencode_sse_and_rejects_invalid_payloads() {
        let event = parse_sse("data: {\"type\":\"message.part.delta\",\"properties\":{\"sessionID\":\"ses_1\",\"messageID\":\"msg_1\",\"delta\":\"Hi\"}}")
            .unwrap().unwrap();
        assert_eq!(event.session_id(), Some("ses_1"));
        assert_eq!(event.message_id(), Some("msg_1"));
        assert_eq!(event.properties["delta"], "Hi");
        assert!(parse_sse(": keepalive").unwrap().is_none());
        assert_eq!(
            parse_sse("data: {bad").unwrap_err().kind,
            "invalid_response"
        );
    }
}
