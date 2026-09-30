# Chat view transition

## Objective and authorization

Animate the existing initial chat view into the conversation when the first
message appears. The user explicitly authorized this animation and excluded
changes to Haze. The image-background specification is outside this scope.

## Problem and smallest design

`ChatPage` switches its layout through `hasTranscript`: the existing composer
jumps from the center to the bottom and the welcome content disappears.
Measure the same composer before and after layout, animate its displacement,
and fade the outgoing welcome content. Keep the input mounted and usable.
Reuse React and the Web Animations API; add no animation dependency.

## Scope and constraints

- Integrate the transition in `src/features/chat/chat-page.tsx` with a small
  dedicated hook and styles only if needed.
- Respect reduced motion, clean up interrupted animations, and do not replay
  the initial transition for subsequent messages or conversation switches.
- Preserve focus and composer state; preserve Haze code, styling, and behavior.
- Preserve the pre-existing untracked `chat-message.tsx` and
  `use-chat-motion.ts` without modifying, importing, or committing them.
- Work locally on the existing `feat/opencode-adapter` feature branch.
  Push, PR creation, and merge are not authorized.

## Route and verification policy

- Route: delegated direct. Mapping required 4+ files; implementation affects
  2+ non-trivial files. Read-only mapping completed by `map_chat_transition`;
  one bounded writer implements the coherent behavior.
- TDD: unconfigured; no enabled TDD setting was found. Ordinary functional
  verification applies, without claiming a RED/GREEN cycle. Source:
  `package.json` and `docs/development.md` (no automated test suite).
- Exact runners: `npm run typecheck`, `npm run lint`, `npm run build`, and
  `npx prettier --check <changed files>`. Use a local browser harness for the
  actual transition and reduced-motion behavior when available.
- Baseline: `npm run typecheck` and `npm run lint` passed before source edits.
- RDD: disabled/unmanaged under the user's opt-in rule; no explicit enablement
  exists in this session. Installed CLI reports `on (decided by default)` with
  both overrides unset, which contradicts that rule. Do not enable, disable,
  or run native reviews on the user's behalf.

## Delivery

- Strategy: `ask-on-risk`; forecast 150–280 authored changed lines, excluding
  this recovery document. No chain strategy is needed at this forecast.
- Branch point / starting commit: `6c1bba3`.
- Running authored count: 260 across behavior and recovery evidence commits. Slice boundaries / PRs: none.
- Each completed task closes with a Conventional Commit containing its code
  and verification documentation, while excluding pre-existing user files.
- Rollback: remove the new transition hook and its ChatPage integration only;
  no settings, services, image processing, or Haze changes are involved.

## Tasks and acceptance criteria

- [x] T1 — Implement and verify the initial-view-to-conversation transition.
      Route: delegated, due to multi-file integration and preparation trigger.
      Acceptance: first message moves the same composer smoothly to the bottom;
      welcome exits; later messages do not replay it; reduced motion is immediate;
      interrupted animations clean up; typing/focus remain usable; Haze and both
      pre-existing untracked files remain unchanged. Run the listed static checks
      and observe the transition in a local runtime; record limitations honestly.
      Commit: `35e8442ff4760d6bc4ebb9589717c2d9ef2327c4` (`feat(chat): animate initial view into conversation`).
      RDD: disabled/unmanaged.

## Progress, evidence, and next step

T1 source implemented: `ChatPage` adds the hook and two refs; the dedicated
hook animates the existing composer for 540 ms and a decorative welcome copy
for 220 ms. No Haze, CSS, services, or user-owned untracked files changed.
Typecheck, ESLint, production build, Prettier, and `git diff --check` pass.

Runtime verification passed 13 assertions against the actual `ChatPage` in
an offline browser fixture: same composer/input and focus/draft, source and
intermediate/final FLIP geometry, decorative fade, no replay for later messages,
completion cleanup handler, new-chat cancellation, history loading and initial
history mount, reduced motion before/mid-flight, and unmount cleanup.

Exact runtime preparation and command (temporary local files only):

- `node /tmp/talo-chat-offline-fixture/build.mjs`
- `python3 /tmp/talo-run-transition-check.py file:///tmp/talo-chat-offline-fixture/index.html`

The runner passed (exit 0), capturing Chrome's DOM report with an isolated
profile. Native WAAPI geometry was sampled at controlled animation times:
composer top 422.234375 px initially, 643.472534 px halfway, 652.359375 px finally.
Chrome's headless display did not deliver the native finish event, although its
`finished` promise resolved. The completion test dispatched a finish event to
verify the registered cleanup handler, and reports that explicitly; native
finish-event timing and manual visual behavior in the desktop app remain
unverified. Chrome required termination after DOM capture because its headless
process did not shut down within 20 seconds.

Initial browser attempts failed during harness setup (timeout, then a CommonJS
optimized-module import mismatch), before behavior assertions ran. The first
offline attempt exposed the headless finish-event limitation above. No source
change was made to bypass those test-environment limitations.

Static verification passed: `npm run typecheck`, `npm run lint`,
`npm run build`, `npx prettier --check src/features/chat/chat-page.tsx src/features/chat/use-chat-view-transition.ts odd/tasks/chat-view-transition.md`,
and `git diff --check`. SHA-256 checks confirm Haze implementation files and
the two pre-existing untracked files remain byte-identical.

T1 completed and committed within these verification limits. Next: optionally
inspect the motion and native completion visually in the desktop app. No push
or PR has been performed.

Engram mirror: observation `994`, topic `odd/chat-view-transition/tasks`,
project `talo`, containing this full document and its repository-relative locator.
