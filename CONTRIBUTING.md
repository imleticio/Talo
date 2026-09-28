# Contributing to Talo

Talo is in its foundation stage. Contributions are most useful when they make one existing workflow clearer or add one well-defined capability without presenting unfinished functionality as working.

## Before changing code

1. Read the [current status](docs/status.md) to check what actually exists.
2. Review the [architecture](docs/architecture.md) to find the right module and dependency direction.
3. For a larger feature, describe the user-visible behavior, boundaries, and verification approach before implementing it. Coordinate through the repository's discussion or issue mechanism once one is available.

This directory does not yet have a hosted repository or issue tracker configured. Do not rely on an issue number, branch policy, or CI workflow that has not been established.

## Make a change

- Keep changes scoped. Frontend features live in `src/features/`; shared UI in `src/components/`; native calls go through `src/services/tauri.ts`.
- Keep Rust business behavior in `src-tauri/src/services/` (or future domain modules). Tauri-specific command handlers belong in `src-tauri/src/commands/`.
- Follow the existing TypeScript, Rust, Tailwind CSS, and shadcn/ui patterns. UI copy and source artifacts are in English.
- Document behavior changes, commands, configuration, and new limitations in the relevant guide. Update the status table when a planned feature becomes real.
- Add meaningful tests when introducing behavior that needs protection; avoid tests that merely repeat static markup. There is no test suite or CI pipeline yet.

Run the local checks before proposing a change:

```bash
npm ci
npm run typecheck
npm run lint
npm run format:check
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo check --manifest-path src-tauri/Cargo.toml
```

For changes that affect the desktop boundary, also launch `npm run tauri dev` and check the affected screen. If a check cannot run on your platform, state which one and why when sharing the change.

## Share the change

Once a repository host accepts pull requests, explain the problem, the user-visible result, verification performed, and any known limitations. Keep unrelated changes separate and include documentation with the behavior it describes. Be respectful and constructive in reviews and issue discussions.

For security concerns, see [SECURITY.md](SECURITY.md). A private reporting channel has not been configured yet.
