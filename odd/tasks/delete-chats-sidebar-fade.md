# Delete chats and soften sidebar edges

## Objective and authorization

User requests a `feature/` branch to delete recent chats and add a modern fade
at the top and bottom of the pictured chat list. Local implementation, checks,
and work-unit commits are authorized. Remote execution, transfers, push, PRs,
and merge are outside the scope.
Latest feedback authorizes subtler cards with the delete button at the bottom
right and the model actually used shown as secondary metadata, matching the
second supplied image. Preserve working deletion and edge fades.

## Problem, approach, and scope

The persistence layer already supports deleting a conversation and cascading
its local messages/session link, but Recent chats exposes no delete action.
Connect that existing operation to a discreet accessible button and confirmation.
Keep unsuccessful deletions intact and clear the open view only after success.
Deleting an inactive chat preserves the open conversation and draft. Prevent
delete/navigation/send races. Do not delete the external OpenCode session.

Add a subtle fade to the scrollable Recent chats viewport, blending with its
existing background. Show each faded edge only when content continues beyond
it; preserve first/last row legibility, pointer access, themes, and collapsed UI.
Reuse existing dependencies. No backend/schema changes or unrelated features.

## Route, configuration, and delivery

- Branch: `feature/delete-chats-sidebar-fade`; starting commit: `9efa00b`.
- T1/T2 route: delegated direct. Read-only worker `explore_chat` mapped the
  shell, hook, persistence API, Rust deletion/cascade, styles, and verification
  configuration (4+ files). Preparation and multi-file writer triggers apply.
- TDD: unconfigured, following existing project configuration recorded in
  `odd/tasks/chat-view-transition.md`, `package.json`, and development docs;
  no test runner/enabled TDD setting exists. Ordinary functional checks apply.
- Exact checks: `npm run typecheck`, `npm run lint`, `npm run build`,
  `npx prettier --check <changed files>`, `git diff --check`, and isolated local
  browser fixtures when available. Baseline typecheck and lint passed.
- Browser plugin setup returned no browsers. Use an isolated offline Chrome
  fixture for runtime checks; never inspect ambient profiles or credentials.
- RDD: disabled/unmanaged. CLI reports on/default with both overrides unset;
  user's explicit default-off policy controls. No reviews or mode changes.
- Delivery: `ask-on-risk`; revised forecast 390–420 authored additions + deletions
  including verification documentation. Running count after T1: 303. No PR slices published.
  About 400 lines is a planning guide, not a correctness limit or size target.
- Rollback: remove these frontend deletion controls/hook integration and list
  fading independently; existing persistence commands remain untouched.

## Tasks and acceptance criteria

- [x] T1 — Expose safe chat deletion (delegated: hook and shell integration).
      Keyboard-accessible delete action and confirmation; inactive deletion preserves
      active chat/draft; active deletion opens empty chat; failure retains state and
      reports error; busy deletion/duplicate actions are guarded. Verify real UI and
      hook with mocked local IPC, no actual user data deletion/provider requests.
      Run static checks and record commit identity and verification limits.
- [x] T2 — Fade overflowing list edges (delegated: shell and CSS integration).
      Subtle top/bottom fades track scroll, overflow, resize, and list changes;
      no fade when all rows fit; first/last rows and controls remain accessible;
      verify light/dark, narrow view, keyboard access, and collapsed sidebar.
      Run static/runtime checks and record commit identity and verification limits.
- [ ] T3 — Refine chat cards and show the model used (delegated).
      Mapping/preparation trigger: model provenance crosses UI, hook, services,
      and persistence. Explore before selecting storage/API changes. Render a
      single coherent selected-card surface, subtle smaller delete at bottom
      right, model secondary metadata; preserve keyboard/confirmation/error
      behavior, concurrency guards and dynamic fading. Historical unknown
      models must not be fabricated from the current composer selection.
      Check frontend and applicable native/runtime behavior.

## Progress and evidence

T1 outcome verified: inline confirmation, row-local failure alert, synchronous
operation guard, and safe clearing of active history/preferences. Typecheck,
lint, build, changed-source Prettier, and diff whitespace checks passed. The
documentation format check initially failed; formatting was corrected.
Runtime: `node /tmp/talo-delete-chats-fixture/build.mjs` then
`node /tmp/talo-delete-chats-cdp-check.mjs` passed 14/14 assertions on the actual
hook/shell/page with mocked IPC: cancellation, active/inactive deletion, failure
and retry, busy/duplicate guards, stale history, keyboard focus and collapse.
Report: `/tmp/talo-delete-chats-delete-results.json`. Parent inspected failure
and empty-view screenshots. Initial fixture/CDP startup and async expectations
failed before runner corrections; the final report passes with no source bypass.
Native Tauri/WebKit visual verification remains unavailable. No user data or
provider operations were used. T1 commit: `1a550bf` (303 authored changed lines).
RDD: disabled/unmanaged. Extra assertion verifies visible inline errors with
40 chats. Planned slice 1: T1 commit; slice 2: T2 and final evidence. Chain
strategy preference requested because the updated forecast can exceed 400;
no answer/remote publishing authorization is assumed.

T2 verified: conditional 22px masks and ResizeObserver/scroll measurement,
with padding and no overlays or scroll mutation. All static checks passed.
`node /tmp/talo-delete-chats-fixture/build.mjs` then
`node /tmp/talo-delete-chats-cdp-check.mjs --fade` passed 14/14; deletion runner
regression passed 14/14. Reports `/tmp/talo-delete-chats-fade-results.json` and
`/tmp/talo-delete-chats-delete-results.json`. Parent inspected dark/light Haze
mid-scroll and narrow last-row confirmation screenshots. Initial fixture
timing/fit expectations were corrected; final reports have no runtime errors.
Native WebKit inspection remains unavailable. T2 commit identity follows.
Chain preference received no response; `feature-branch-chain` is a provisional
local planning assumption only. Slice 1 holds T1; slice 2 holds T2; T3 gets its
own slice pending mapping. No publication or approval is inferred.

Existing Rust persistence tests passed (one assertion each, no user data):
`cargo test --manifest-path src-tauri/Cargo.toml --test persistence project_removal_detaches_conversations_and_conversation_removal_cascades -- --exact`
and `cargo test --manifest-path src-tauri/Cargo.toml --test persistence upgrades_existing_messages_in_legacy_order_without_losing_relationships -- --exact`.

Engram mirror: observation `995`, project `talo`, topic
`odd/delete-chats-sidebar-fade/tasks`, full document and repository-relative
locator read back. MCP save initially failed due to ambiguous active sessions;
independent `engram save --project talo` succeeded, without cloud autosync.
Next: commit T2 and map T3 following the latest user feedback.
