# Project status

Talo is a desktop UI foundation, not yet a working multi-agent manager. This page records what a contributor can verify today; future areas below are proposals, not committed dates or releases.

## Capability inventory

| Area                                         | Status                       | Current limit                                                                                                       |
| -------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Desktop shell and navigation                 | Implemented                  | Sections are selected in React state; selection is not restored after restart.                                      |
| Dark theme and shared UI                     | Implemented                  | Dark theme is the only theme.                                                                                       |
| Native window translucency                   | Implemented on macOS/Windows | Opt-in vibrancy/Acrylic with a tint slider; unavailable on Linux/browser and not yet validated on Windows hardware. |
| Chat                                         | Visual placeholder           | Composer and send button are disabled; no conversations or message history.                                         |
| Agents                                       | Visual placeholder           | No agent configuration, execution, or coordination.                                                                 |
| Projects                                     | Visual placeholder           | No project creation, loading, or persistence.                                                                       |
| Settings / app info                          | Implemented in desktop       | Native `get_app_info` returns name and version; browser preview shows an explanation instead.                       |
| Error handling                               | Implemented for appearance   | Native-effect errors preserve the previous toggle state and appear in Settings.                                     |
| Tokio                                        | Dependency configured        | No background tasks or independent runtime.                                                                         |
| SQLite / rusqlite                            | Not started                  | No dependency, schema, migration, or stored domain data; appearance uses `localStorage`.                            |
| AI providers, MCP, multi-agent orchestration | Not started                  | No connections or external agent operations.                                                                        |
| Automated tests and CI                       | Not started                  | TypeScript, ESLint, Prettier, frontend build, and `cargo check` are local checks.                                   |

## Proposed next work

1. Agree on the first usable agent/provider workflow and its observable behavior before enabling the chat composer.
2. Design persistence requirements and migrations before adding SQLite/rusqlite.
3. Add behavior-focused tests alongside the first real workflows, then automate existing checks in CI.
4. Set up repository hosting, issue intake, private security reporting, and a release process before inviting external contributions at scale.

These are areas to shape, not a promised order, feature list, or timeline. If functionality changes, update this inventory in the same change. See [architecture](architecture.md) for extension points and [contributing](../CONTRIBUTING.md) for the current contribution workflow.
