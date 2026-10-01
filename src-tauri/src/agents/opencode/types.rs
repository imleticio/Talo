use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;

use crate::agents::{AgentEvent, AgentTask};
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
                map_tool(part)
            }
            "todo.updated" => {
                let tasks = self
                    .properties
                    .get("todos")?
                    .as_array()?
                    .iter()
                    .enumerate()
                    .filter_map(|(index, task)| {
                        let label = task.get("content")?.as_str()?.to_owned();
                        let state = match task.get("status")?.as_str()? {
                            "pending" => "pending",
                            "in_progress" => "active",
                            "completed" => "completed",
                            "cancelled" => "cancelled",
                            _ => return None,
                        };
                        Some(AgentTask {
                            id: index.to_string(),
                            label,
                            state: state.to_owned(),
                        })
                    })
                    .collect();
                Some(AgentEvent::Tasks { tasks })
            }
            "permission.asked" | "permission.v2.asked" | "question.asked" | "question.v2.asked" => {
                Some(AgentEvent::Attention {
                    id: self.properties.get("id")?.as_str()?.to_owned(),
                    title: if self.kind.starts_with("question") {
                        "Answer required"
                    } else {
                        "Approval required"
                    }
                    .to_owned(),
                    detail: self
                        .properties
                        .get("permission")
                        .or_else(|| self.properties.get("action"))
                        .and_then(Value::as_str)
                        .map(str::to_owned),
                })
            }
            "permission.replied"
            | "permission.v2.replied"
            | "question.replied"
            | "question.rejected"
            | "question.v2.replied"
            | "question.v2.rejected" => Some(AgentEvent::AttentionResolved {
                id: self.properties.get("requestID")?.as_str()?.to_owned(),
            }),
            "session.status"
                if self.properties.get("status")?.get("type")?.as_str()? == "retry" =>
            {
                Some(AgentEvent::Status {
                    text: self
                        .properties
                        .get("status")?
                        .get("message")?
                        .as_str()?
                        .to_owned(),
                })
            }
            "message.part.updated"
                if self.properties.get("part")?.get("type")?.as_str()? == "patch" =>
            {
                Some(AgentEvent::FilesChanged {
                    files: string_array(self.properties.get("part")?.get("files")),
                })
            }
            "message.part.updated"
                if self.properties.get("part")?.get("type")?.as_str()? == "reasoning" =>
            {
                Some(AgentEvent::Status {
                    text: "Thinking".to_owned(),
                })
            }
            _ => None,
        }
    }
}

fn string_array(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::to_owned)
        .collect()
}

fn map_tool(part: &Value) -> Option<AgentEvent> {
    let name = part.get("tool")?.as_str()?;
    let state = part.get("state")?;
    let status = state.get("status")?.as_str()?;
    if !matches!(status, "pending" | "running" | "completed" | "error") {
        return None;
    }
    let input = &state["input"];
    let metadata = &state["metadata"];
    let mut action = match name {
        "read" => "read",
        "glob" | "grep" | "list" => "search",
        "edit" | "multiedit" | "apply_patch" => "edit",
        "write" => "write",
        "bash" => "command",
        _ => "tool",
    };
    let mut path = input
        .get("filePath")
        .or_else(|| input.get("path"))
        .and_then(Value::as_str)
        .map(str::to_owned);
    if name == "apply_patch" {
        // These are the tool's structured patch headers, not assistant message text.
        if let Some(patch) = input.get("patchText").and_then(Value::as_str) {
            for line in patch.lines() {
                if let Some(file) = line.strip_prefix("*** Update File: ") {
                    path = Some(file.trim().to_owned());
                    break;
                }
                if let Some(file) = line.strip_prefix("*** Add File: ") {
                    path = Some(file.trim().to_owned());
                    action = "create";
                    break;
                }
                if let Some(file) = line.strip_prefix("*** Delete File: ") {
                    path = Some(file.trim().to_owned());
                    action = "delete";
                    break;
                }
            }
        }
    }
    let command = input
        .get("command")
        .and_then(Value::as_str)
        .map(str::to_owned);
    // Patch metadata is structured by OpenCode; never infer changes from model prose.
    let mut files = Vec::new();
    if status == "completed" {
        if matches!(name, "edit" | "multiedit" | "write") {
            files.extend(path.clone());
        }
        if name == "apply_patch" {
            if let Some(entries) = metadata.get("files").and_then(Value::as_array) {
                for file in entries {
                    if let Some(path) = file
                        .get("movePath")
                        .filter(|v| !v.is_null())
                        .or_else(|| file.get("filePath"))
                        .and_then(Value::as_str)
                    {
                        files.push(path.to_owned());
                    }
                }
            }
        }
    }
    Some(AgentEvent::Tool {
        id: part
            .get("callID")
            .or_else(|| part.get("id"))?
            .as_str()?
            .to_owned(),
        name: name.to_owned(),
        state: status.to_owned(),
        action: action.to_owned(),
        title: state
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or(name)
            .to_owned(),
        path,
        command,
        output: state
            .get("error")
            .or_else(|| state.get("output"))
            .and_then(Value::as_str)
            .map(|text| text.chars().take(16_384).collect()),
        exit_code: metadata
            .get("exit")
            .or_else(|| metadata.get("exitCode"))
            .and_then(Value::as_i64),
        files,
    })
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
    use serde_json::json;

    fn mapped(kind: &str, properties: Value) -> Value {
        serde_json::to_value(
            Event {
                kind: kind.to_owned(),
                properties,
            }
            .mapped()
            .unwrap(),
        )
        .unwrap()
    }

    #[test]
    fn normalizes_structured_tools_without_inventing_exit_codes_or_changes() {
        let running = mapped(
            "message.part.updated",
            json!({"part": {
                "type":"tool", "id":"part", "callID":"call", "tool":"edit",
                "state":{"status":"running","input":{"filePath":"src/chat.ts"},"title":"Update chat"}
            }}),
        );
        assert_eq!(running["id"], "call");
        assert_eq!(running["action"], "edit");
        assert_eq!(running["path"], "src/chat.ts");
        assert_eq!(running["files"], json!([]));
        assert!(running["exitCode"].is_null());
        let command = mapped(
            "message.part.updated",
            json!({"part": {
                "type":"tool", "id":"cmd", "tool":"bash", "state":{"status":"completed",
                "input":{"command":"cargo test"},"metadata":{"exit":1},"output":"failed"}
            }}),
        );
        assert_eq!(command["action"], "command");
        assert_eq!(command["exitCode"], 1);
        assert_eq!(command["output"], "failed");
        let failed = mapped(
            "message.part.updated",
            json!({"part": {
                "type":"tool", "id":"failed", "tool":"write", "state":{"status":"error",
                "input":{"filePath":"src/new.ts"},"error":"denied"}
            }}),
        );
        assert_eq!(failed["files"], json!([]));
        assert_eq!(failed["output"], "denied");
    }

    #[test]
    fn maps_patch_input_and_confirmed_metadata_not_session_wide_diffs() {
        let patch = mapped(
            "message.part.updated",
            json!({"part": {
                "type":"tool", "id":"patch", "tool":"apply_patch", "state":{"status":"running",
                "input":{"patchText":"*** Begin Patch\n*** Add File: src/new.ts\n+hello\n*** End Patch"}}
            }}),
        );
        assert_eq!(patch["action"], "create");
        assert_eq!(patch["path"], "src/new.ts");
        assert_eq!(patch["files"], json!([]));
        let completed = mapped(
            "message.part.updated",
            json!({"part": {
                "type":"tool", "id":"patch", "tool":"apply_patch", "state":{"status":"completed",
                "input":{},"metadata":{"files":[{"filePath":"old.ts","movePath":"new.ts"},{"filePath":"deleted.ts"}]}}
            }}),
        );
        assert_eq!(completed["files"], json!(["new.ts", "deleted.ts"]));
        let diff = Event {
            kind: "session.diff".to_owned(),
            properties: json!({"sessionID":"s","diff":[{"file":"previous-turn.ts","additions":4}]}),
        };
        assert!(diff.mapped().is_none());
        let patch_part = mapped(
            "message.part.updated",
            json!({"part":{"type":"patch","files":["changed.ts"]}}),
        );
        assert_eq!(patch_part["files"], json!(["changed.ts"]));
    }

    #[test]
    fn normalizes_plan_and_attention_lifecycle_and_ignores_unknown_states() {
        let tasks = mapped(
            "todo.updated",
            json!({"todos":[
                {"content":"Inspect","status":"completed"}, {"content":"Build","status":"in_progress"},
                {"content":"Validate","status":"pending"}, {"content":"Skip","status":"cancelled"},
                {"content":"Unknown","status":"unexpected"}
            ]}),
        );
        assert_eq!(tasks["tasks"].as_array().unwrap().len(), 4);
        assert_eq!(tasks["tasks"][1]["state"], "active");
        let permission = mapped("permission.asked", json!({"id":"p","permission":"edit"}));
        assert_eq!(permission["type"], "attention");
        assert_eq!(permission["detail"], "edit");
        let resolved = mapped("permission.replied", json!({"requestID":"p"}));
        assert_eq!(resolved["type"], "attention_resolved");
        assert_eq!(resolved["id"], "p");
        let invalid = Event {
            kind: "message.part.updated".to_owned(),
            properties: json!({"part":{"type":"tool","id":"x","tool":"read","state":{"status":"unknown"}}}),
        };
        assert!(invalid.mapped().is_none());
    }

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
