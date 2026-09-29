use rusqlite::Connection;
use talo_lib::database::Database;
use talo_lib::models::{MessageRole, MessageStatus};
use talo_lib::services::persistence as service;
use tempfile::tempdir;

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
        2
    );
    assert_eq!(service::get_project(&db, project.id).unwrap().name, "Home");
    assert_eq!(service::list_conversations(&db, None).unwrap().len(), 1);
    let messages = service::list_messages(&db, conversation.id).unwrap();
    assert_eq!(
        [messages[0].id.as_str(), messages[1].id.as_str()],
        [first.id.as_str(), second.id.as_str()]
    );
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
        2
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
    let finished =
        service::update_message(&db, message.id, "Final".into(), MessageStatus::Completed).unwrap();
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
        "validation"
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
