# Architecture

Talo runs React in a Tauri 2 window. The Rust host owns local SQLite storage and native window/background effects; there is no HTTP server or provider integration.

## Runtime path

```text
src-tauri/src/main.rs -> lib.rs -> setup: app_data_dir/talo.db, migrations, recovery
                                  -> existing window/background initialization
React -> src/services/persistence.ts -> Tauri commands/persistence.rs
                                     -> spawn_blocking -> services/persistence.rs
                                                       -> database/mod.rs -> SQLite
```

Each storage command opens its own connection in a blocking worker. Connections enable foreign keys, WAL, and a five-second busy timeout. The startup setup opens the database, creates `app_data_dir` if needed, applies versioned SQL migrations transactionally using `PRAGMA user_version`, and changes lingering `streaming` messages to `interrupted`. A schema version newer than the application fails startup without migration or recovery writes. Startup errors also abort startup rather than silently opening an empty store.

## Responsibilities

| Location | Responsibility |
| --- | --- |
| `src/features/` | Current screens and settings; stored projects/conversations/messages are not displayed yet. |
| `src/services/persistence.ts` | Typed, reusable Tauri invocation API and DTOs for future React wiring. |
| `src/services/tauri.ts` | Existing app/window metadata gateway. |
| `src-tauri/src/commands/` | Tauri adapters; persistence calls dispatch database work off the async runtime. |
| `src-tauri/src/services/persistence.rs` | UUID and text validation; framework-independent use cases. |
| `src-tauri/src/database/` | SQLite connections, migrations, parameterized repositories, transactional message/activity updates. |
| `src-tauri/src/models.rs`, `errors.rs` | Serializable DTOs, enums and structured `{ kind, message }` errors. |
| `src-tauri/src/agents/` | Reserved; no agents implemented. |

## Storage rules

`001_core.sql` defines projects, conversations, and messages with UUID text keys and UTC RFC 3339 timestamps. Messages have constrained roles (`system`, `user`, `assistant`, `tool`) and statuses (`completed`, `streaming`, `failed`, `interrupted`); empty text is rejected. A conversation may have no project. Removing a project sets its conversations' `project_id` to NULL; removing a conversation cascades to its messages. `002_external_sessions.sql` reserves a conversation-to-external-session association for later use; no provider is integrated and no credentials are stored. Indexed conversation/project lookups and ordered message queries support the current access patterns.

Projects support create/list/get/update/delete; conversations create/list (optionally filtered by project)/get/rename/delete; messages create/list-by-conversation/update-content-and-status. A missing ID returns `not_found`, malformed IDs or blank text return `validation`, and foreign-key failures return `constraint`. Updating a project replaces its optional description; pass `null` to clear it. No database path is supplied by the renderer.

## Existing native behavior

App info, Haze image backgrounds, and native translucency/blur remain separate commands. Settings appearance preferences use `localStorage`; stored domain data uses SQLite. The macOS/Windows transparent window configuration and macOS dock/launch preparation still run in `lib.rs`. Linux and browser previews do not provide those native window effects.

The base Tauri CSP and main-window capability remain in `src-tauri/tauri.conf.json` and `src-tauri/capabilities/default.json`. macOS private API support in `tauri.macos.conf.json` precludes Mac App Store distribution with that configuration.
