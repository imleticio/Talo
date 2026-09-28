# Talo

Talo is an open-source desktop project for coordinating AI agents. Today it is an early application shell: you can navigate Chat, Agents, Projects, and Settings, but you cannot send messages, run agents, or save projects yet. The interface makes these limits explicit.

The visual direction takes inspiration from MonoCode's restrained desktop UI; Talo is an independent project.

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
| Agents and Projects      | Navigable placeholder screens; no records are created.                        |
| Settings                 | Displays app info and optional native window translucency on macOS/Windows.   |
| Storage and integrations | Appearance is saved locally; no projects, AI providers, or agents are stored. |

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
