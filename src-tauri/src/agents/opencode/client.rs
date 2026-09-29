use std::time::Duration;

use futures_util::StreamExt;
use percent_encoding::{NON_ALPHANUMERIC, utf8_percent_encode};
use reqwest::{Client, Response, StatusCode};
use serde::de::DeserializeOwned;
use serde_json::json;

use super::types::{Event, Health, Session, parse_sse};
use crate::errors::{AppError, AppResult};

#[derive(Clone)]
pub struct OpenCodeClient {
    http: Client,
    endpoint: String,
    directory: String,
}

impl OpenCodeClient {
    pub fn endpoint(&self) -> &str {
        &self.endpoint
    }

    pub fn new(endpoint: String, directory: &str) -> AppResult<Self> {
        let parsed = reqwest::Url::parse(&endpoint)
            .map_err(|_| AppError::new("validation", "Invalid OpenCode endpoint"))?;
        if parsed.scheme() != "http"
            || parsed.host_str() != Some("127.0.0.1")
            || parsed.port().is_none()
            || parsed.path() != "/"
            || parsed.query().is_some()
            || parsed.fragment().is_some()
            || parsed.username() != ""
            || parsed.password().is_some()
        {
            return Err(AppError::new(
                "validation",
                "OpenCode endpoint must be local",
            ));
        }
        let http = Client::builder()
            .no_proxy()
            .connect_timeout(Duration::from_secs(2))
            .timeout(Duration::from_secs(10))
            .build()
            .map_err(|_| AppError::new("storage", "Could not initialize HTTP client"))?;
        Ok(Self {
            http,
            endpoint: endpoint.trim_end_matches('/').to_owned(),
            directory: utf8_percent_encode(directory, NON_ALPHANUMERIC).to_string(),
        })
    }

    fn request(&self, method: reqwest::Method, path: &str) -> reqwest::RequestBuilder {
        self.http
            .request(method, format!("{}{path}", self.endpoint))
            .header("x-opencode-directory", &self.directory)
    }

    pub async fn health(&self) -> AppResult<Health> {
        self.json(self.request(reqwest::Method::GET, "/global/health"))
            .await
    }

    pub async fn create_session(&self, title: &str) -> AppResult<String> {
        let session: Session = self
            .json(
                self.request(reqwest::Method::POST, "/session")
                    .json(&json!({"title": title})),
            )
            .await?;
        valid_id(session.id)
    }

    pub async fn get_session(&self, id: &str) -> AppResult<String> {
        let session: Session = self
            .json(self.request(
                reqwest::Method::GET,
                &format!("/session/{}", valid_id(id.to_owned())?),
            ))
            .await?;
        valid_id(session.id)
    }

    pub async fn prompt(&self, id: &str, content: &str) -> AppResult<()> {
        let id = valid_id(id.to_owned())?;
        self.response(
            self.request(
                reqwest::Method::POST,
                &format!("/session/{id}/prompt_async"),
            )
            .json(&json!({"parts": [{"type": "text", "text": content}]})),
        )
        .await?;
        Ok(())
    }

    pub async fn abort(&self, id: &str) -> AppResult<()> {
        let id = valid_id(id.to_owned())?;
        let result: bool = self
            .json(self.request(reqwest::Method::POST, &format!("/session/{id}/abort")))
            .await?;
        if !result {
            return Err(AppError::new(
                "unavailable",
                "OpenCode did not abort the session",
            ));
        }
        Ok(())
    }

    pub async fn events(
        &self,
    ) -> AppResult<std::pin::Pin<Box<dyn futures_util::Stream<Item = AppResult<Event>> + Send>>>
    {
        let response = self
            .response(
                self.request(reqwest::Method::GET, "/event")
                    .header("accept", "text/event-stream")
                    .timeout(Duration::from_secs(3600)),
            )
            .await?;
        if !response
            .headers()
            .get("content-type")
            .is_some_and(|header| {
                header
                    .to_str()
                    .is_ok_and(|value| value.starts_with("text/event-stream"))
            })
        {
            return Err(AppError::new(
                "invalid_response",
                "OpenCode did not return an event stream",
            ));
        }
        let stream = async_stream::try_stream! {
            let mut bytes = response.bytes_stream();
            let mut pending = Vec::new();
            while let Some(chunk) = bytes.next().await {
                let chunk = chunk.map_err(network_error)?;
                pending.extend_from_slice(&chunk);
                if pending.len() > 1024 * 1024 {
                    Err(AppError::new("invalid_response", "OpenCode event too large"))?;
                }
                while let Some((end, separator)) = pending.windows(4).position(|window| window == b"\r\n\r\n").map(|pos| (pos, 4))
                    .or_else(|| pending.windows(2).position(|window| window == b"\n\n").map(|pos| (pos, 2))) {
                    let frame = std::str::from_utf8(&pending[..end])
                        .map_err(|_| AppError::new("invalid_response", "Invalid event encoding"))?.to_owned();
                    pending.drain(..end + separator);
                    if let Some(event) = parse_sse(&frame)? {
                        yield event;
                    }
                }
            }
        };
        Ok(Box::pin(stream))
    }

    async fn json<T: DeserializeOwned>(&self, request: reqwest::RequestBuilder) -> AppResult<T> {
        self.response(request)
            .await?
            .json::<T>()
            .await
            .map_err(|error| {
                if error.is_timeout() {
                    network_error(error)
                } else {
                    AppError::new("invalid_response", "Invalid OpenCode response")
                }
            })
    }

    async fn response(&self, request: reqwest::RequestBuilder) -> AppResult<Response> {
        let response = request.send().await.map_err(network_error)?;
        match response.status() {
            status if status.is_success() => Ok(response),
            StatusCode::NOT_FOUND => Err(AppError::new(
                "session_not_found",
                "OpenCode resource not found",
            )),
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => Err(AppError::new(
                "authentication",
                "OpenCode server requires authentication",
            )),
            _ => Err(AppError::new(
                "unavailable",
                format!("OpenCode returned HTTP {}", response.status()),
            )),
        }
    }
}

fn valid_id(id: String) -> AppResult<String> {
    if id.is_empty()
        || id.len() > 128
        || !id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
    {
        return Err(AppError::new(
            "invalid_response",
            "Invalid OpenCode session ID",
        ));
    }
    Ok(id)
}

fn network_error(error: reqwest::Error) -> AppError {
    if error.is_timeout() {
        AppError::new("timeout", "OpenCode did not respond in time")
    } else if error.is_connect() {
        AppError::new("connection_refused", "Could not connect to OpenCode")
    } else {
        AppError::new("unavailable", "OpenCode connection failed")
    }
}
