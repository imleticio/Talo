-- A future provider adapter can associate an external session with a local conversation.
-- No provider credentials or protocol-specific payloads belong in this table.
CREATE TABLE external_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    external_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (provider, external_id)
);
CREATE INDEX external_sessions_conversation_id ON external_sessions(conversation_id);
