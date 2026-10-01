use std::sync::{Arc, Barrier};
use std::thread;

use rusqlite::{Connection, params};
use talo_lib::database::Database;
use talo_lib::models::{MessageRole, MessageStatus};
use talo_lib::services::persistence as service;
use tempfile::tempdir;

#[test]
fn conversation_agent_comes_from_its_linked_service_not_model_provider() {
    let dir = tempdir().unwrap();
    let db = Database::initialize(dir.path()).unwrap();
    let first = db.create_conversation(None, "OpenCode chat").unwrap();
    let second = db.create_conversation(None, "Other service").unwrap();
    assert!(db.get_conversation(&first.id).unwrap().agent_id.is_none());
    db.link_session(&first.id, "opencode", "session-one")
        .unwrap();
    db.link_session(&second.id, "codex", "session-two").unwrap();
    db.set_conversation_model(&first.id, Some(&("anthropic".into(), "claude".into())))
        .unwrap();
    drop(db);
    let db = Database::initialize(dir.path()).unwrap();
    assert_eq!(
        db.get_conversation(&first.id).unwrap().agent_id.as_deref(),
        Some("opencode")
    );
    let chats = db.list_conversations(None).unwrap();
    assert_eq!(
        chats
            .iter()
            .find(|chat| chat.id == second.id)
            .unwrap()
            .agent_id
            .as_deref(),
        Some("codex")
    );
}

#[test]
fn conversation_branch_survives_restart_and_repository_changes() {
    let dir = tempdir().unwrap();
    let db = Database::initialize(dir.path()).unwrap();
    let first = service::create_conversation_with_repository(
        &db,
        None,
        "First".into(),
        Some("/repo"),
        Some("feat/sidebar"),
    )
    .unwrap();
    service::create_conversation_with_repository(
        &db,
        None,
        "Second".into(),
        Some("/repo"),
        Some("main"),
    )
    .unwrap();
    let legacy = service::create_conversation(&db, None, "No repository".into()).unwrap();
    drop(db);
    let db = Database::initialize(dir.path()).unwrap();
    let saved = service::get_conversation(&db, first.id.clone()).unwrap();
    assert_eq!(saved.branch.as_deref(), Some("feat/sidebar"));
    assert_eq!(saved.repository_path.as_deref(), Some("/repo"));
    let listed = service::list_conversations(&db, None).unwrap();
    assert_eq!(
        listed
            .iter()
            .find(|item| item.id == first.id)
            .unwrap()
            .branch,
        saved.branch
    );
    assert!(
        service::get_conversation(&db, legacy.id)
            .unwrap()
            .branch
            .is_none()
    );
}

#[test]
fn migrates_empty_database_and_reopens_without_resetting_records() {
    let dir = tempdir().unwrap();
    let db = Database::initialize(dir.path()).unwrap();
    let project = service::create_project(&db, "Home".into(), Some("Tasks".into())).unwrap();
    let conversation =
        service::create_conversation(&db, Some(project.id.clone()), "Today".into()).unwrap();
    let first = service::create_message(
        &db,
        conversation.id.clone(),
        MessageRole::User,
        "One".into(),
        MessageStatus::Completed,
    )
    .unwrap();
    let second = service::create_message(
        &db,
        conversation.id.clone(),
        MessageRole::Assistant,
        "Two".into(),
        MessageStatus::Completed,
    )
    .unwrap();
    drop(db);

    let db = Database::initialize(dir.path()).unwrap();
    let connection = Connection::open(dir.path().join("talo.db")).unwrap();
    assert_eq!(
        connection
            .query_row("PRAGMA user_version", [], |row| row.get::<_, u32>(0))
            .unwrap(),
        5
    );
    assert_eq!(service::get_project(&db, project.id).unwrap().name, "Home");
    assert_eq!(service::list_conversations(&db, None).unwrap().len(), 1);
    let messages = service::list_messages(&db, conversation.id).unwrap();
    assert_eq!(
        [messages[0].id.as_str(), messages[1].id.as_str()],
        [first.id.as_str(), second.id.as_str()]
    );
    assert_eq!([messages[0].sequence, messages[1].sequence], [1, 2]);
}

#[test]
fn upgrades_v1_without_removing_existing_data() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("talo.db");
    let connection = Connection::open(&path).unwrap();
    connection
        .execute_batch(include_str!("../src/database/migrations/001_core.sql"))
        .unwrap();
    connection.pragma_update(None, "user_version", 1).unwrap();
    let project_id = uuid::Uuid::new_v4().to_string();
    connection.execute(
        "INSERT INTO projects VALUES (?1, 'Existing', NULL, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
        [&project_id],
    ).unwrap();
    drop(connection);

    let db = Database::initialize(dir.path()).unwrap();
    assert_eq!(
        service::get_project(&db, project_id).unwrap().name,
        "Existing"
    );
    let connection = Connection::open(path).unwrap();
    assert_eq!(
        connection
            .query_row("PRAGMA user_version", [], |row| row.get::<_, u32>(0))
            .unwrap(),
        5
    );
    assert_eq!(
        connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE name = 'external_sessions'",
                [],
                |row| row.get::<_, u32>(0)
            )
            .unwrap(),
        1
    );
}

#[test]
fn project_removal_detaches_conversations_and_conversation_removal_cascades() {
    let dir = tempdir().unwrap();
    let db = Database::initialize(dir.path()).unwrap();
    let project = service::create_project(&db, "Work".into(), None).unwrap();
    let linked =
        service::create_conversation(&db, Some(project.id.clone()), "Linked".into()).unwrap();
    let standalone = service::create_conversation(&db, None, "Standalone".into()).unwrap();
    let message = service::create_message(
        &db,
        linked.id.clone(),
        MessageRole::System,
        "Context".into(),
        MessageStatus::Completed,
    )
    .unwrap();
    assert_eq!(
        service::list_conversations(&db, Some(project.id.clone()))
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        service::create_conversation(
            &db,
            Some(uuid::Uuid::new_v4().to_string()),
            "Missing".into()
        )
        .unwrap_err()
        .kind,
        "constraint"
    );
    service::delete_project(&db, project.id).unwrap();
    assert!(
        service::get_conversation(&db, linked.id.clone())
            .unwrap()
            .project_id
            .is_none()
    );
    assert_eq!(
        service::list_messages(&db, linked.id.clone())
            .unwrap()
            .len(),
        1
    );
    assert!(service::get_conversation(&db, standalone.id).is_ok());
    service::delete_conversation(&db, linked.id).unwrap();
    let connection = Connection::open(dir.path().join("talo.db")).unwrap();
    assert_eq!(
        connection
            .query_row(
                "SELECT COUNT(*) FROM messages WHERE id = ?1",
                [message.id],
                |row| row.get::<_, u32>(0)
            )
            .unwrap(),
        0
    );
}

#[test]
fn updates_records_and_recovers_streaming_on_restart() {
    let dir = tempdir().unwrap();
    let db = Database::initialize(dir.path()).unwrap();
    let project = service::create_project(&db, "Before".into(), None).unwrap();
    let project =
        service::update_project(&db, project.id, "After".into(), Some("New".into())).unwrap();
    assert_eq!(project.description.as_deref(), Some("New"));
    let conversation = service::create_conversation(&db, None, "Before".into()).unwrap();
    let conversation = service::rename_conversation(&db, conversation.id, "After".into()).unwrap();
    let message = service::create_message(
        &db,
        conversation.id.clone(),
        MessageRole::Assistant,
        "Draft".into(),
        MessageStatus::Streaming,
    )
    .unwrap();
    let message =
        service::update_message(&db, message.id, "Partial".into(), MessageStatus::Streaming)
            .unwrap();
    drop(db);
    let db = Database::initialize(dir.path()).unwrap();
    let recovered = service::list_messages(&db, conversation.id).unwrap();
    assert_eq!(recovered[0].content, "Partial");
    assert!(matches!(recovered[0].status, MessageStatus::Interrupted));
    assert_eq!(
        service::update_message(
            &db,
            message.id.clone(),
            "Final".into(),
            MessageStatus::Completed
        )
        .unwrap_err()
        .kind,
        "validation"
    );
    let finished = service::recover_interrupted_message(&db, message.id, "Final".into()).unwrap();
    assert_eq!(finished.content, "Final");
    assert!(matches!(finished.status, MessageStatus::Completed));
}

#[test]
fn rejects_invalid_inputs_and_unknown_future_schema_without_mutating_it() {
    let dir = tempdir().unwrap();
    let db = Database::initialize(dir.path()).unwrap();
    assert_eq!(
        service::create_project(&db, "  ".into(), None)
            .unwrap_err()
            .kind,
        "validation"
    );
    assert_eq!(
        service::get_project(&db, "not-a-uuid".into())
            .unwrap_err()
            .kind,
        "validation"
    );
    assert_eq!(
        service::create_conversation(&db, None, " \n".into())
            .unwrap_err()
            .kind,
        "validation"
    );
    let conversation = service::create_conversation(&db, None, "Valid".into()).unwrap();
    assert_eq!(
        service::create_message(
            &db,
            conversation.id.clone(),
            MessageRole::User,
            " ".into(),
            MessageStatus::Completed
        )
        .unwrap_err()
        .kind,
        "validation"
    );
    assert_eq!(
        service::update_message(
            &db,
            uuid::Uuid::new_v4().to_string(),
            "  ".into(),
            MessageStatus::Failed
        )
        .unwrap_err()
        .kind,
        "not_found"
    );
    assert_eq!(
        service::list_messages(&db, uuid::Uuid::new_v4().to_string())
            .unwrap_err()
            .kind,
        "not_found"
    );
    drop(db);
    let connection = Connection::open(dir.path().join("talo.db")).unwrap();
    connection.pragma_update(None, "user_version", 999).unwrap();
    drop(connection);
    assert_eq!(
        Database::initialize(dir.path()).err().unwrap().kind,
        "unsupported_schema"
    );
    let connection = Connection::open(dir.path().join("talo.db")).unwrap();
    assert_eq!(
        connection
            .query_row("SELECT COUNT(*) FROM conversations", [], |row| row
                .get::<_, u32>(0))
            .unwrap(),
        1
    );
}

#[test]
fn streams_from_empty_content_and_preserves_untokenized_drafts_on_restart() {
    let dir = tempdir().unwrap();
    let db = Database::initialize(dir.path()).unwrap();
    let conversation = service::create_conversation(&db, None, "Streaming".into()).unwrap();
    let first = service::create_message(
        &db,
        conversation.id.clone(),
        MessageRole::Assistant,
        String::new(),
        MessageStatus::Streaming,
    )
    .unwrap();
    let untouched = service::create_message(
        &db,
        conversation.id.clone(),
        MessageRole::Assistant,
        String::new(),
        MessageStatus::Streaming,
    )
    .unwrap();
    let first =
        service::update_message(&db, first.id, " ".into(), MessageStatus::Streaming).unwrap();
    assert_eq!(first.content, " ");
    let first =
        service::update_message(&db, first.id, " Hello".into(), MessageStatus::Streaming).unwrap();
    let first = service::update_message(
        &db,
        first.id,
        " Hello world".into(),
        MessageStatus::Completed,
    )
    .unwrap();
    drop(db);

    let db = Database::initialize(dir.path()).unwrap();
    let messages = service::list_messages(&db, conversation.id).unwrap();
    assert_eq!(messages[0].id, first.id);
    assert_eq!(messages[0].content, " Hello world");
    assert_eq!(messages[0].status, MessageStatus::Completed);
    assert_eq!(messages[1].id, untouched.id);
    assert_eq!(messages[1].content, "");
    assert_eq!(messages[1].status, MessageStatus::Interrupted);
    assert_eq!(messages[1].sequence, 2);
    assert_eq!(
        service::recover_interrupted_message(&db, untouched.id.clone(), String::new())
            .unwrap_err()
            .kind,
        "validation"
    );
    let restored =
        service::recover_interrupted_message(&db, untouched.id, "Recovered".into()).unwrap();
    assert_eq!(restored.status, MessageStatus::Completed);
}

#[test]
fn validates_message_states_and_guards_terminal_rows_in_sqlite() {
    let dir = tempdir().unwrap();
    let db = Database::initialize(dir.path()).unwrap();
    let conversation = service::create_conversation(&db, None, "States".into()).unwrap();
    for (role, status) in [
        (MessageRole::User, MessageStatus::Streaming),
        (MessageRole::Assistant, MessageStatus::Interrupted),
    ] {
        assert_eq!(
            service::create_message(&db, conversation.id.clone(), role, "".into(), status)
                .unwrap_err()
                .kind,
            "validation"
        );
    }
    assert_eq!(
        service::create_message(
            &db,
            conversation.id.clone(),
            MessageRole::User,
            " \n".into(),
            MessageStatus::Completed
        )
        .unwrap_err()
        .kind,
        "validation"
    );
    let failed = service::create_message(
        &db,
        conversation.id.clone(),
        MessageRole::Assistant,
        "".into(),
        MessageStatus::Failed,
    )
    .unwrap();
    let completed = service::create_message(
        &db,
        conversation.id.clone(),
        MessageRole::User,
        "OK".into(),
        MessageStatus::Completed,
    )
    .unwrap();
    for (id, status) in [
        (failed.id.clone(), MessageStatus::Streaming),
        (completed.id.clone(), MessageStatus::Completed),
    ] {
        assert_eq!(
            service::update_message(&db, id.clone(), "change".into(), status)
                .unwrap_err()
                .kind,
            "validation"
        );
        assert_eq!(
            service::recover_interrupted_message(&db, id, "change".into())
                .unwrap_err()
                .kind,
            "validation"
        );
    }
    let stream = service::create_message(
        &db,
        conversation.id.clone(),
        MessageRole::Assistant,
        "".into(),
        MessageStatus::Streaming,
    )
    .unwrap();
    let failed_stream =
        service::update_message(&db, stream.id, "partial".into(), MessageStatus::Failed).unwrap();
    assert_eq!(failed_stream.content, "partial");
    assert_eq!(
        service::update_message(
            &db,
            failed_stream.id,
            "retry".into(),
            MessageStatus::Completed
        )
        .unwrap_err()
        .kind,
        "validation"
    );
    let interrupted = service::create_message(
        &db,
        conversation.id.clone(),
        MessageRole::Assistant,
        "".into(),
        MessageStatus::Streaming,
    )
    .unwrap();
    let interrupted =
        service::update_message(&db, interrupted.id, "".into(), MessageStatus::Interrupted)
            .unwrap();
    assert_eq!(
        service::update_message(
            &db,
            interrupted.id.clone(),
            "retry".into(),
            MessageStatus::Streaming
        )
        .unwrap_err()
        .kind,
        "validation"
    );

    let connection = Connection::open(dir.path().join("talo.db")).unwrap();
    assert!(
        connection
            .execute(
                "UPDATE messages SET content = 'changed' WHERE id = ?1",
                [&completed.id]
            )
            .is_err()
    );
    assert!(
        connection
            .execute(
                "UPDATE messages SET status = 'completed' WHERE id = ?1",
                [&failed.id]
            )
            .is_err()
    );
    assert!(
        connection
            .execute(
                "UPDATE messages SET content = ' ' WHERE id = ?1",
                [&interrupted.id]
            )
            .is_err()
    );
    assert!(
        connection
            .execute(
                "UPDATE messages SET status = 'completed' WHERE id = ?1",
                [&interrupted.id]
            )
            .is_err()
    );
    assert!(connection.execute("INSERT INTO messages (id, conversation_id, sequence, role, content, status, created_at, updated_at) VALUES ('bad', ?1, 100, 'user', '', 'completed', 'now', 'now')", [&conversation.id]).is_err());
}

#[test]
fn upgrades_existing_messages_in_legacy_order_without_losing_relationships() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("talo.db");
    let connection = Connection::open(&path).unwrap();
    connection
        .execute_batch(include_str!("../src/database/migrations/001_core.sql"))
        .unwrap();
    connection
        .execute_batch(include_str!(
            "../src/database/migrations/002_external_sessions.sql"
        ))
        .unwrap();
    connection
        .pragma_update(None, "foreign_keys", "ON")
        .unwrap();
    connection.pragma_update(None, "user_version", 2).unwrap();
    let project = uuid::Uuid::new_v4().to_string();
    let conversation = uuid::Uuid::new_v4().to_string();
    let other = uuid::Uuid::new_v4().to_string();
    connection
        .execute(
            "INSERT INTO projects VALUES (?1, 'Old', NULL, 'a', 'a')",
            [&project],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO conversations VALUES (?1, ?2, 'Old', 'a', 'a')",
            params![conversation, project],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO conversations VALUES (?1, NULL, 'Other', 'a', 'a')",
            [&other],
        )
        .unwrap();
    let ids: Vec<_> = (0..4).map(|_| uuid::Uuid::new_v4().to_string()).collect();
    // Deliberately insert timestamps out of order and include a tie: old display order was created_at, rowid.
    for (id, conversation_id, content, created_at) in [
        (&ids[0], &conversation, "late", "2026-01-02"),
        (&ids[1], &conversation, "early", "2026-01-01"),
        (&ids[2], &conversation, "tie", "2026-01-01"),
        (&ids[3], &other, "other", "2026-01-01"),
    ] {
        connection
            .execute(
                "INSERT INTO messages VALUES (?1, ?2, 'assistant', ?3, 'completed', ?4, ?4)",
                params![id, conversation_id, content, created_at],
            )
            .unwrap();
    }
    let external = uuid::Uuid::new_v4().to_string();
    connection
        .execute(
            "INSERT INTO external_sessions VALUES (?1, ?2, 'legacy', 'reference', 'a')",
            params![external, conversation],
        )
        .unwrap();
    drop(connection);

    let db = Database::initialize(dir.path()).unwrap();
    let messages = service::list_messages(&db, conversation.clone()).unwrap();
    let legacy = service::get_conversation(&db, conversation.clone()).unwrap();
    assert!(legacy.last_provider_id.is_none());
    assert!(legacy.last_model_id.is_none());
    assert_eq!(
        messages
            .iter()
            .map(|message| message.id.as_str())
            .collect::<Vec<_>>(),
        vec![ids[1].as_str(), ids[2].as_str(), ids[0].as_str()]
    );
    assert_eq!(
        messages
            .iter()
            .map(|message| message.content.as_str())
            .collect::<Vec<_>>(),
        vec!["early", "tie", "late"]
    );
    assert_eq!(
        messages
            .iter()
            .map(|message| message.sequence)
            .collect::<Vec<_>>(),
        vec![1, 2, 3]
    );
    assert_eq!(service::list_messages(&db, other).unwrap()[0].sequence, 1);
    let added = service::create_message(
        &db,
        conversation.clone(),
        MessageRole::User,
        "new".into(),
        MessageStatus::Completed,
    )
    .unwrap();
    assert_eq!(added.sequence, 4);
    let connection = Connection::open(&path).unwrap();
    connection
        .pragma_update(None, "foreign_keys", "ON")
        .unwrap();
    assert!(
        connection
            .prepare("PRAGMA foreign_key_check")
            .unwrap()
            .query([])
            .unwrap()
            .next()
            .unwrap()
            .is_none()
    );
    assert_eq!(
        connection
            .query_row(
                "SELECT COUNT(*) FROM external_sessions WHERE id = ?1",
                [&external],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
        1
    );
    assert!(connection.execute("INSERT INTO messages (id, conversation_id, sequence, role, content, status, created_at, updated_at) VALUES ('duplicate', ?1, 1, 'user', 'x', 'completed', 'a', 'a')", [&conversation]).is_err());
    drop(connection);
    service::delete_conversation(&db, conversation).unwrap();
    let connection = Connection::open(&path).unwrap();
    assert_eq!(
        connection
            .query_row(
                "SELECT COUNT(*) FROM external_sessions WHERE id = ?1",
                [&external],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
        0
    );
}

#[test]
fn conversation_model_survives_restart_and_can_be_cleared() {
    let dir = tempdir().unwrap();
    let db = Database::initialize(dir.path()).unwrap();
    let conversation = service::create_conversation(&db, None, "Model".into()).unwrap();
    let other = service::create_conversation(&db, None, "Untouched".into()).unwrap();
    assert!(conversation.last_model_id.is_none());
    db.set_conversation_model(&conversation.id, Some(&("provider".into(), "model".into())))
        .unwrap();
    drop(db);
    let db = Database::initialize(dir.path()).unwrap();
    let restored = service::get_conversation(&db, conversation.id.clone()).unwrap();
    assert_eq!(restored.last_provider_id.as_deref(), Some("provider"));
    assert_eq!(restored.last_model_id.as_deref(), Some("model"));
    assert!(
        service::get_conversation(&db, other.id)
            .unwrap()
            .last_model_id
            .is_none()
    );
    let listed = service::list_conversations(&db, None).unwrap();
    assert_eq!(
        listed
            .iter()
            .find(|row| row.id == conversation.id)
            .unwrap()
            .last_model_id
            .as_deref(),
        Some("model")
    );
    db.set_conversation_model(&conversation.id, None).unwrap();
    let cleared = service::get_conversation(&db, conversation.id.clone()).unwrap();
    assert!(cleared.last_provider_id.is_none());
    assert!(cleared.last_model_id.is_none());
    service::delete_conversation(&db, conversation.id.clone()).unwrap();
    assert_eq!(
        db.set_conversation_model(&conversation.id, None)
            .unwrap_err()
            .kind,
        "not_found"
    );
}

#[test]
fn concurrent_inserts_get_unique_sequences_in_the_same_conversation() {
    let dir = tempdir().unwrap();
    let db = Database::initialize(dir.path()).unwrap();
    let conversation = service::create_conversation(&db, None, "Concurrent".into()).unwrap();
    let count = 16;
    let barrier = Arc::new(Barrier::new(count));
    let workers: Vec<_> = (0..count)
        .map(|index| {
            let db = db.clone();
            let conversation_id = conversation.id.clone();
            let barrier = barrier.clone();
            thread::spawn(move || {
                barrier.wait();
                service::create_message(
                    &db,
                    conversation_id,
                    MessageRole::User,
                    format!("message {index}"),
                    MessageStatus::Completed,
                )
                .unwrap()
            })
        })
        .collect();
    let mut sequences: Vec<_> = workers
        .into_iter()
        .map(|worker| worker.join().unwrap().sequence)
        .collect();
    sequences.sort_unstable();
    assert_eq!(sequences, (1..=count as i64).collect::<Vec<_>>());
    let messages = service::list_messages(&db, conversation.id).unwrap();
    assert_eq!(
        messages
            .iter()
            .map(|message| message.sequence)
            .collect::<Vec<_>>(),
        sequences
    );
}

#[test]
fn failed_migration_rolls_back_schema_and_preserves_existing_rows() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("talo.db");
    let connection = Connection::open(&path).unwrap();
    connection
        .execute_batch(include_str!("../src/database/migrations/001_core.sql"))
        .unwrap();
    connection
        .execute_batch(include_str!(
            "../src/database/migrations/002_external_sessions.sql"
        ))
        .unwrap();
    connection.pragma_update(None, "user_version", 2).unwrap();
    // Simulate a database previously written with foreign_keys disabled. The new
    // table's FK must reject this row without discarding the old table or data.
    connection
        .pragma_update(None, "foreign_keys", "OFF")
        .unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    connection.execute(
        "INSERT INTO messages VALUES (?1, 'missing-conversation', 'user', 'Keep me', 'completed', 'a', 'a')",
        [&id],
    ).unwrap();
    drop(connection);

    assert_eq!(
        Database::initialize(dir.path()).err().unwrap().kind,
        "constraint"
    );
    let connection = Connection::open(&path).unwrap();
    assert_eq!(
        connection
            .pragma_query_value(None, "user_version", |row| row.get::<_, u32>(0))
            .unwrap(),
        2
    );
    assert_eq!(
        connection
            .query_row("SELECT content FROM messages WHERE id = ?1", [&id], |row| {
                row.get::<_, String>(0)
            })
            .unwrap(),
        "Keep me"
    );
    assert!(connection.prepare("SELECT sequence FROM messages").is_err());
}
