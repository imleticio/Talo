# Talo

Talo is an open-source desktop workspace for coordinating AI assistants, projects, and conversations from one place.

The project is currently in **early MVP development**. The native backend already provides local persistence and an initial OpenCode integration, while the React interface is still being connected to those capabilities.

<img width="1918" height="1078" alt="image" src="https://github.com/user-attachments/assets/7f16c696-fb8c-4d45-a6f4-824777e19f40" />

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/ff1b9dc1-a81c-4b13-bf6b-6dfd63114a2e" />

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/4e6c58a0-ecf8-40a6-adab-60b784b9c1f7" />


## Current status

| Area | Status |
| --- | --- |
| Desktop shell and navigation | Implemented with React, TypeScript and Tauri 2 |
| Local persistence | Implemented with Rust, SQLite and versioned migrations |
| Projects | Native CRUD implemented; React screen not connected yet |
| Conversations | Native CRUD implemented with optional project association |
| Messages | Persistent ordered messages with streaming/interrupted/completed states |
| OpenCode adapter | Implemented in the native backend |
| Streaming responses | Implemented through OpenCode SSE events |
| Session persistence | OpenCode sessions can be associated with local conversations |
| Cancellation | Implemented for active OpenCode runs |
| Chat UI | Present, but sending is still disabled while frontend wiring is completed |
| Agents / Projects UI | Placeholder screens for the current MVP |
| Additional AI providers | Not implemented yet |

## OpenCode integration

Talo's first AI integration is built around a provider-agnostic `AgentAdapter` boundary in Rust.

The current `OpenCodeAdapter` can:

- detect an existing local OpenCode server;
- start `opencode serve` locally when needed;
- create and recover OpenCode sessions;
- send prompts to a session;
- consume streamed responses through Server-Sent Events;
- surface text deltas, tool activity, completion and error events;
- cancel active runs;
- persist user and assistant messages in SQLite.

The adapter only accepts loopback OpenCode endpoints and keeps provider-specific session identifiers separate from Talo's local conversation model.

The next MVP step is connecting this backend workflow to the React chat interface.

## Persistence

See [GitHub integration](docs/github.md) to connect your account, view pull request
checks and reviews, and merge a published PR from the chat.

## Develop and contribute

The current schema includes:

- projects;
- conversations;
- messages;
- external provider sessions.

Database initialization applies versioned migrations, enables foreign keys and WAL mode, and recovers messages left in a streaming state after an interrupted application session.

## Architecture

```text
React / TypeScript
        |
        | Tauri commands
        v
Rust application layer
   |             |
   |             +--> AgentAdapter --> OpenCode
   |
   +--> SQLite persistence
        |
        +--> Projects
        +--> Conversations
        +--> Messages
        +--> External sessions
```

This separation is intended to keep provider-specific integrations outside the UI and make future adapters possible without coupling the application to a single AI runtime.

## Tech stack

- **Desktop:** Tauri 2
- **Frontend:** React, TypeScript, Vite, Tailwind CSS
- **Native backend:** Rust
- **Database:** SQLite / rusqlite
- **Async & networking:** Tokio, Reqwest
- **Current AI runtime:** OpenCode
- **UI:** Radix UI, shadcn-style components, Lucide

## Run locally

### Requirements

- Node.js 20.19+ or 22.12+
- npm
- Rust 1.90+
- Tauri 2 system prerequisites for your platform
- OpenCode available on `PATH` to exercise the current agent backend

### Start the desktop app

```bash
npm ci
npm run tauri dev
```

For a browser-only UI preview:

```bash
npm run dev
```

The browser preview does not provide access to Tauri's native Rust commands.

## Validation

Frontend:

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
```

Rust:

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

The repository includes Rust integration tests for persistence and the OpenCode adapter.

## MVP direction

The immediate focus is to turn the existing backend foundations into a usable end-to-end desktop workflow:

1. connect projects and conversations to the React interface;
2. wire the chat composer to the OpenCode adapter;
3. render streamed responses and tool activity in the UI;
4. expose agent configuration and project association;
5. add additional provider adapters after the OpenCode flow is stable.

## Project

Talo is a personal open-source project currently under active development.

## License

MIT — see [LICENSE](LICENSE).
