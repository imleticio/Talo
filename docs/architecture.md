# Architecture

Talo has a React renderer and a Tauri 2/Rust host. Settings requests app metadata and controls an optional native window effect through Tauri commands. No agent or database adapter is connected.

## Runtime path

```text
Desktop startup: src-tauri/src/main.rs -> lib.rs (registers commands)
Renderer startup: src/main.tsx -> src/App.tsx -> SettingsPage
SettingsPage -> src/services/tauri.ts -> invoke("get_app_info")
             -> commands::get_app_info -> services::get_app_info
App startup / Settings -> src/services/tauri.ts -> window appearance commands
                      -> native macOS vibrancy or Windows Acrylic
```

The browser preview renders the same screens, but `SettingsPage` checks `isTauri()` before calling the native command. Navigation is local React state in `src/App.tsx`; it is not a router and is not persisted.

## Module responsibilities

| Location                                           | Responsibility                                                                                     |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/features/{chat,agents,projects,settings}/`    | Feature screens; Chat, Agents, and Projects currently show honest empty states.                    |
| `src/components/layout/`                           | App shell, sidebar, header, and navigation metadata.                                               |
| `src/components/ui/`                               | Local shadcn/ui component source (Button and Textarea).                                            |
| `src/index.css`, `components.json`                 | Tailwind v4 theme tokens, dark default, and shadcn/ui configuration.                               |
| `src/services/tauri.ts`, `src/services/errors.ts`  | Native command gateway and normalization of rejected values into frontend `AppError`.              |
| `src/features/settings/use-window-translucency.ts` | Loads/saves the local appearance preference and synchronizes native effect with CSS surfaces.      |
| `src-tauri/src/commands/`                          | Tauri-specific adapters for app metadata and native window appearance.                             |
| `src-tauri/src/services/`                          | Framework-independent application logic; today it returns package name and version.                |
| `src-tauri/src/errors.rs`                          | Serializable `{ kind, message }` Rust error and `AppResult<T>` alias, ready for fallible commands. |
| `src-tauri/src/agents/`, `src-tauri/src/database/` | Reserved module boundaries; no agent logic or database implementation.                             |

## Native calls

`SettingsPage` calls `getAppInfo()` in `src/services/tauri.ts`. That gateway invokes `get_app_info` through `@tauri-apps/api/core`. The Rust handler delegates to `services::get_app_info()`, which returns `{ name: "Talo", version: CARGO_PKG_VERSION }`. The command currently has no failure branch. If the invocation fails, the frontend converts the rejected value to `AppError` and displays its message on the Settings screen.

`useWindowTranslucency()` checks `supports_window_translucency` when the app starts. On macOS/Windows, `set_window_translucency` applies/removes a native effect on the main window; a mutex prevents duplicate macOS effect views. Only after a successful native call does the renderer switch its backgrounds to translucent tints. On failure the toggle stays unchanged and Settings displays the error. The enabled flag and tint opacity are saved in browser `localStorage` for appearance only, then restored on next launch. Linux and browser previews do not activate the effect.

Keep Tauri types and macros in command/composition code. Services should accept and return plain data and remain usable without a window. If persistence or providers are added later, introduce adapters at their boundary rather than moving business behavior into handlers.

## Runtime and security configuration

- `src-tauri/tauri.conf.json` starts Vite on port 5173 in development, bundles `../dist`, sets the product identifier and window size, and defines a restrictive Content Security Policy that includes the Tauri IPC connection.
- `src-tauri/tauri.macos.conf.json` and `src-tauri/tauri.windows.conf.json` replace the main window configuration with transparent-window versions; Linux keeps the opaque base configuration. macOS requires `macOSPrivateApi` for Tauri's transparent webview. That private API means this configuration is not eligible for Mac App Store distribution; it is a distribution tradeoff, not required for a normal local build.
- `src-tauri/capabilities/default.json` assigns `core:default` to the main window. New native permissions should be added only with the feature that needs them.
- Tokio is declared with `rt-multi-thread` and `macros` for future asynchronous work. The app does not start a separate Tokio runtime or run background agent tasks today.
- There is no SQLite schema, persisted domain data, secrets store, provider integration, MCP server, or agent orchestration. The appearance preference is the sole local setting. See [status](status.md).

## Change map

| To add...          | Start at...                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| A new screen       | `src/features/`, then navigation in `src/components/layout/navigation.ts` and `src/App.tsx`.                                                 |
| A native operation | A service operation, then an adapter in `src-tauri/src/commands/`, registration in `lib.rs`, and a typed gateway in `src/services/tauri.ts`. |
| A persistent store | A contract needed by the service, then its adapter under `src-tauri/src/database/`. Do not put SQL in a Tauri command.                       |

See [development](development.md) for the local commands.
