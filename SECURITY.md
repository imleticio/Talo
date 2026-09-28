# Security and disclosure

Talo is a pre-release desktop foundation. No production release is supported yet. The current build does not connect to AI providers, store credentials, or load projects from disk.

## Current boundary

- The main Tauri window has the `core:default` capability in `src-tauri/capabilities/default.json`.
- `src-tauri/tauri.conf.json` defines the Content Security Policy, including the Tauri IPC connection.
- Native commands return app metadata, report platform support for translucency, and enable/disable the native window effect. The appearance preference is stored in webview `localStorage`; no credentials are involved.
- macOS's platform-specific Tauri configuration enables `macOSPrivateApi` to make the webview transparent. This prevents Mac App Store distribution with the current configuration.

See [architecture](docs/architecture.md) and [project status](docs/status.md) for the exact implementation. Reassess these boundaries whenever a new native permission, provider, or persistence layer is added.

## Reporting an issue

There is no published private vulnerability-reporting channel yet. Before sending sensitive details, ask the project maintainer for a private channel; do not include exploit steps or credentials in public issues. Maintainers should configure private reporting and update this document before accepting external security reports. No response-time commitment has been set.
