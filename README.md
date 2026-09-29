# Talo

Talo is an open-source desktop project for coordinating AI agents. Today it has an early application shell and a native local storage API for projects, conversations, and messages. The screens are not connected to that API yet: chat sending and agent execution remain disabled.

Talo is an open-source desktop AI assistant designed to help you get things done. Chat with AI, delegate tasks to specialized agents, and manage your workflows from one place.
Our vision is to build an intelligent desktop companion that goes beyond conversations — an assistant that can take action, use tools, and work on your behalf.

Early development

Talo is currently in its early stages. The desktop interface includes Chat, Agents, Projects, and Settings. AI conversations, agent execution, and project persistence are not yet implemented.

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/4c3b4609-1ac9-403b-8089-d0fcffca2f96" />


## Run the desktop app

1. Install a supported Node.js version (20.19+ or 22.12+), npm, Rust 1.90+, and the [Tauri 2 prerequisites for your OS](https://v2.tauri.app/start/prerequisites/).
2. From the project root, run:

   ```bash
   npm ci
   npm run tauri dev
   ```

The Talo window opens on Chat. Sending is disabled until provider integration exists. Settings shows the desktop app name and version returned by Rust and offers optional window translucency on supported desktop platforms.

For a browser-only UI preview, run `npm run dev` and open `http://localhost:5173/`. Native runtime details are unavailable in the browser.

## What works now

| Area                     | Current behavior                                                              |
| ------------------------ | ----------------------------------------------------------------------------- |
| Chat                     | Empty state and disabled composer; no messages are sent.                      |
| Agents and Projects      | Navigable placeholder screens; native project CRUD is not wired to the UI.    |
| Settings                 | Displays app info and optional native window translucency on macOS/Windows.   |
| Storage and integrations | SQLite stores projects, conversations and messages via Tauri commands; appearance uses local settings. No AI providers or agents. |

See [project status](docs/status.md) for the full capability inventory and proposed next areas of work.

## Develop and contribute

| Document                                 | Start here when you want to...                                              |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| [Development guide](docs/development.md) | Install prerequisites, run checks, or build locally.                        |
| [Architecture](docs/architecture.md)     | Understand modules, the Tauri command boundary, and security configuration. |
| [Contributing](CONTRIBUTING.md)          | Prepare a focused change and know which checks to run.                      |
| [Project status](docs/status.md)         | Distinguish working behavior from future plans.                             |
| [Security](SECURITY.md)                  | Review the current native boundary and reporting status.                    |

## License

Talo's source is licensed under the [MIT License](LICENSE).
