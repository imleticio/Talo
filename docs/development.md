# Local development

This guide covers running the current desktop shell and validating changes. For a first look, use the [README quick start](../README.md).

## Prerequisites

- Node.js 20.19+ or 22.12+ with npm; use a maintained version compatible with Vite 8.
- Rust 1.90+ installed through [rustup](https://rustup.rs/).
- [Tauri 2 system dependencies](https://v2.tauri.app/start/prerequisites/) for your platform. macOS requires Xcode Command Line Tools; Windows needs the documented C++ toolchain and WebView2; Linux needs its distribution-specific WebKit/GTK packages.

## Install and launch

From the project root:

```bash
npm ci
npm run tauri dev
```

The Tauri CLI runs `npm run dev` automatically and starts the Rust host. Vite uses port 5173 with `strictPort: true`; free that port if another process already occupies it. `src-tauri/Cargo.lock` and `package-lock.json` lock Rust and npm dependencies respectively.

For frontend-only work, use `npm run dev` and open `http://localhost:5173/`. This does not launch Rust: Settings cannot fetch native app details, and no chat operation exists in either mode.

Window translucency is opt-in in Settings. macOS uses native vibrancy; Windows uses Acrylic where supported. The opacity slider changes only the tint covering the native effect, not the sharpness of UI content. Linux and the browser preview display an unavailable control. The preference lives in the webview's `localStorage`, not SQLite. Changes to either platform-specific Tauri configuration require restarting the desktop app. The macOS `macOSPrivateApi` flag used for a transparent webview is incompatible with Mac App Store submission; see [architecture](architecture.md).

## Validate

| Command                                                     | What it checks                                    |
| ----------------------------------------------------------- | ------------------------------------------------- |
| `npm run typecheck`                                         | TypeScript project references.                    |
| `npm run lint`                                              | ESLint for TypeScript and React code.             |
| `npm run format:check`                                      | Prettier formatting, including Markdown.          |
| `npm run build`                                             | TypeScript and production Vite bundle in `dist/`. |
| `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` | Rust formatting.                                  |
| `cargo check --manifest-path src-tauri/Cargo.toml`          | Rust compilation without a distributable binary.  |

Run `npm run format` and `cargo fmt --manifest-path src-tauri/Cargo.toml` to format source before checking again. A production desktop package can be requested with `npm run tauri build`; packaging requires platform-specific prerequisites and has not been established as a release workflow.

There is currently no automated test suite or CI pipeline. For UI changes, also inspect the affected screen in the desktop app; a passing bundle does not validate appearance or accessibility.

## Working in the codebase

- Keep UI source and copy in English, matching the current repository. UI tokens are in `src/index.css`; HTML opts into the dark theme via `index.html`.
- Add shared shadcn/ui components as source under `src/components/ui/` using the existing `components.json` configuration; do not add a second component framework.
- A new native command needs registration in `src-tauri/src/lib.rs` and a corresponding typed function in `src/services/tauri.ts`. Handle rejected invocations through `src/services/errors.ts`.
- Preserve the service/command separation described in [architecture](architecture.md). Update [status](status.md) when a capability becomes usable.

If the window does not open, confirm the Tauri prerequisites and the Rust build output first. If only the browser preview fails, confirm that port 5173 is free and `npm ci` completed. Browser previews do not provide the Tauri IPC runtime.
