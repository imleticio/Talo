-- Rebuild only messages; external_sessions references conversations, not messages.
-- Foreign keys stay enabled throughout this transaction.
CREATE TABLE messages_next (
    id TEXT PRIMARY KEY NOT NULL,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
    content TEXT NOT NULL CHECK (
        instr(content, char(0)) = 0
        AND (status != 'completed' OR length(trim(content)) > 0)
    ),
    status TEXT NOT NULL CHECK (status IN ('completed', 'streaming', 'failed', 'interrupted')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (conversation_id, sequence)
);

INSERT INTO messages_next (id, conversation_id, sequence, role, content, status, created_at, updated_at)
SELECT id, conversation_id,
       ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY created_at, rowid),
       role, content, status, created_at, updated_at
FROM messages;

DROP TABLE messages;
ALTER TABLE messages_next RENAME TO messages;

CREATE TRIGGER messages_status_guard
BEFORE UPDATE OF status, content ON messages
WHEN OLD.status IN ('completed', 'failed')
  OR (OLD.status = 'interrupted' AND NEW.status != 'completed')
  OR (OLD.status = 'streaming' AND NEW.status NOT IN ('streaming', 'completed', 'failed', 'interrupted'))
BEGIN
    SELECT RAISE(ABORT, 'invalid message status transition');
END;
