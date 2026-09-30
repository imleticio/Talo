# Chat view transition

## Objective and authorization

Animate the existing initial chat view into the conversation when the first
message appears. The user explicitly authorized this animation and excluded
changes to Haze. The image-background specification is outside this scope.
The user then requested a smoother send animation because the current motion
still feels abrupt. This authorizes a focused refinement of the same transition.
Latest feedback accepts the general appearance but asks for more perceptible
fluidity and explicitly authorizes the Haze image darkening gradually on send.
This supersedes the earlier Haze exclusion for that focused visual change.
The user approved T2 and now grants creative freedom to further refine the
same interaction for Talo's innovation identity, with Apple effects as a
visual preference. T3 adds spatial continuity from drafted text to sent message.

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
- Preserve focus and composer state. Haze may now animate image brightness and
  opacity into the conversation; retain image selection, opacity preferences,
  scope, preview, and theme behavior.
- Preserve the pre-existing untracked `chat-message.tsx` and
  `use-chat-motion.ts` without modifying, importing, or committing them.
- For the refinement, leave those files untouched; commit `a1ada96` has since
  added them to HEAD, but the active chat view does not use them.
- Work locally on the existing `feat/opencode-adapter` feature branch.
  Push, PR creation, and merge are not authorized.

## Route and verification policy

- Route: delegated direct. Mapping required 4+ files; implementation affects
  2+ non-trivial files. Read-only mapping completed by `map_chat_transition`;
  one bounded writer implements the coherent behavior.
- T2 route: delegated direct. `map_chat_motion` mapped 4+ relevant files;
  coordinated changes to `ChatPage` and the transition hook trigger a writer.
- T2 latest refinement: delegated direct. `map_send_haze_refinement` mapped
  the active transition, send timing, Haze styles, shell, and settings. A bounded
  writer changes the transition hook and Haze CSS together (two-file trigger).
- T3 route: delegated direct. `map_signature_send` mapped 4+ files and the
  asynchronous send lifecycle. One bounded writer changes the active page,
  transition hook, and feedback CSS (preparation and multi-file triggers).
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

- Strategy: `ask-on-risk`; the initial forecast was 150–280 authored changed
  lines. The current accumulated branch exceeds that forecast.
- Branch point / starting commit: `6c1bba3`.
- Running authored count before T2: 535 across prior work-unit commits and
  intervening commit `a1ada96` (275 lines). Forecast T2: 110–200 authored
  changed lines. The chain-strategy question was asked once in the prior turn.
  No answer was received; use the recommended `feature-branch-chain` as an
  explicit provisional planning assumption, not a user approval or permission
  to publish. This routine delivery preference does not block authorized local
  work-unit commits. The user can change it before PR preparation.
- Planned review boundaries: slice 1 holds `35e8442` and `e585f5f` (260 authored
  lines); slice 2 holds intervening user commit `a1ada96` (275 lines, outside T2
  verification); slice 3 holds T2 and its evidence commit (forecast 110–200).
  These are planned local boundaries; no PRs or delivery branches were created.
- Running authored count through T2 behavior commit `43c6c84`: 700 lines
  (535 prior + 165 in T2). Slice 3 currently contains `43c6c84` plus this
  small documentation evidence update, keeping the slice below 400 lines.
- Including this evidence update: running authored count 720; T2 slice 185.
- T3 starts at `2ff7408`; forecast 260–380 authored changed lines including
  recovery evidence. Use a new review slice for this coherent interaction,
  retaining the provisional feature-branch-chain strategy. The 400-line task
  heuristic is advisory; do not compress or omit checks to fit it.
- T3 behavior commit `3571d0a` contains 368 authored changed lines (305 source,
  63 recovery documentation); running count through it is 1,088. Review slice 4
  holds `3571d0a` and its documentation evidence update, independently of T2.
- Including T3 evidence: running authored count 1,100; review slice 4 is 380.
- Each completed task closes with a Conventional Commit containing its code
  and verification documentation, while excluding pre-existing user files.
- Rollback T2: revert its hook/ChatPage changes and Haze CSS refinement;
  settings, services, and image processing are outside this work unit.

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
- [x] T2 — Smooth the send transition after user feedback.
      Route: delegated, due to mapping, preparation, and two-file integration.
      Acceptance: composer movement, welcome exit, and transcript entrance feel
      coordinated on first send; transcript does not flash or jump after paint;
      later messages and conversation navigation do not replay the transition;
      movement is more perceptible; Haze gradually darkens with no abrupt mask
      change, remains dim during the conversation, and restores on a new chat;
      reduced motion is immediate; cancellation cleans all animations; Haze
      settings, preview, scope and both themes remain functional; the inactive
      chat-motion files remain untouched. Run typecheck, lint, build, Prettier,
      and an available browser runtime check.
      Outcome and automated checks observed; desktop visual feel remains a
      manual follow-up. Commit: `43c6c84bc24733002cea8fa78d92998ce7f28e53`
      (`feat(chat): smooth send motion and dim Haze`). RDD: disabled/unmanaged.
- [x] T3 — Add a distinctive send interaction with spatial continuity.
      Route: delegated, due to mapping/preparation and three active source files.
      Acceptance: Enter and button share guarded submission and immediate subtle
      feedback; the newly persisted user message visually travels from the
      composer into its real bubble; first-send motion and Haze remain coherent;
      later sends use the message motion without replaying the initial layout;
      real message content is complete and accessible, with safe behavior for
      long/multiline text, backend delay/failure, history, navigation and scrolling;
      reduced motion/cancellation/unmount restore real content and clean copies;
      no dependencies, provider calls or service/persistence changes. Ordinary
      typecheck, lint, build, changed-file Prettier and local runtime checks.
      Outcome and checks observed. Commit: `3571d0af862dd215d0bc290ff1f4692413f0b66d`
      (`feat(chat): carry sent text into the conversation`). RDD: disabled/unmanaged.

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

T2 source implemented by `smooth_chat_send`: `ChatPage` now scrolls before
paint and passes a transcript ref to the transition hook. The same composer
moves for 520 ms with a gentler curve; the welcome fades and rises for 280 ms;
the transcript stays hidden for 110 ms, then fades and rises for 340 ms. The
transcript animation joins cancellation and reduced-motion cleanup. No Haze or
inactive chat-motion files changed. Rollback boundary: only the two T2 source
edits and their T2 documentation.

T2 checks passed: `npm run typecheck`, `npm run lint`, `npm run build`,
`npx prettier --check src/features/chat/chat-page.tsx src/features/chat/use-chat-view-transition.ts`,
and `git diff --check`. The local Chrome fixture passed 17 assertions for
geometry, timing, focus/draft, later-message behavior, completion cleanup,
navigation/history, reduced motion, and unmount. Runner:
`node /tmp/talo-chat-offline-fixture/build.mjs` then
`python3 /tmp/talo-run-transition-check.py file:///tmp/talo-chat-offline-fixture/index.html`.
Native finish fired; headless Chrome needed termination after DOM capture.
The in-app browser was unavailable, so desktop visual feel remains unverified.
Those checks cover the previous T2 iteration. Latest feedback invalidates its
visual sufficiency; T2 remains open. Plan: increase composer duration to roughly
680 ms, increase welcome/transcript travel modestly, and animate Haze brightness
from 1.3 to about 0.95 alongside configurable opacity with stable masks/blur.
Keep the actual transcript trigger so failed pre-start sends do not change the
layout. The existing spinner provides immediate send feedback.

Microinteractions diagnostic: 7/8 rows (9/10 rounded); feedback scaling is the
failed row. The more visible travel and coordinated background dim address it.
Latest T2 refinement implemented by `smooth_chat_send`: composer movement
680 ms with `cubic-bezier(0.4, 0, 0.2, 1)`; welcome exit 340 ms / -16 px;
transcript entrance 440 ms / 18 px after 150 ms. Haze transitions filter and
configured opacity over 680 ms with the same curve; brightness goes from 1.3
to 0.95. Shared masks, overlay, and blur avoid the previous abrupt image change.
Image/opacity preferences, preview blur/offset, scope, and reduced motion remain
functional. Only `ChatPage`, the transition hook, and Haze CSS are source changes.

Latest static checks all passed: `npm run typecheck`, `npm run lint`,
`npm run build`, `npx prettier --check src/features/chat/chat-page.tsx src/features/chat/use-chat-view-transition.ts src/index.css`,
and `git diff --check`. The temporary local Chrome fixture passed 33 assertions
in normal mode and 33 with native CSS reduced motion. Coverage includes the
prior chat geometry/cleanup cases and Haze intermediate brightness/opacity,
stable masks/blur, persistent dim, restoration, light/dark themes, settings
preview, configured opacity, and empty-only scope. Normal intermediate sample
at 340 ms: opacity 0.200798 and brightness 1.02855.

Runtime preparation: `node /tmp/talo-chat-offline-fixture/build.mjs`.
Normal runner: `python3 /tmp/talo-run-transition-check.py file:///tmp/talo-chat-offline-fixture/index.html`.
Reduced runner: `python3 /tmp/talo-run-transition-reduced-check.py file:///tmp/talo-chat-offline-fixture/index.html`,
using an isolated Chrome profile and native
`--force-prefers-reduced-motion=reduce`. Native finish fired in the normal run;
the reduced run required a synthetic finish event for the pre-existing
controlled-animation completion-handler assertion. Both runs required Chrome
termination after DOM capture. No real provider calls were made. Desktop
visual feel remains unverified because the available UI tooling could not
inspect the development window. T2 is complete within these stated limits.
Both runners write `/tmp/talo-chat-transition-results.json`; the reduced run
overwrote the normal report. Normal evidence is retained in the tool transcript;
the reduced JSON was read back and all 33 results passed.

T2 committed with its implementation and verification document. Next: assess
visual feel in the running desktop app when available. The provisional chain
strategy above is planning only. No push or PR has been performed.

T3 exploration: send immediately enters connecting, but the transcript can
first contain only an assistant placeholder. Capture text and existing message
IDs at submission, wait for the real new user bubble, measure after autoscroll,
and animate an inert decorative copy. Keep the real composer and independent
cleanup for initial movement and delayed message motion. Add a restrained
glass reflection as immediate feedback. Avoid nonuniform text scaling; a long
message may use a short entrance instead of a large or clipped flying copy.
Retain T2 Haze settings and dim state. Desktop visual tooling remains unavailable;
extend the local browser fixture to cover lifecycle and rendering boundaries.
Microinteractions diagnostic remains 7/8 (9/10 rounded): feedback scaling is
the row being improved through direct text-to-message continuity.

T3 implemented by `implement_signature_send` in three active files (305 authored
source lines). Enter/button share guarded submission and a synchronous lock.
A 560 ms glass reflection confirms submission; ordinary persisted messages
travel for 580 ms from the current composer position into their real bubble.
The decorative source/destination ink overlaps while the material forms;
placeholder hiding prevents doubled lettering. Tall messages use a 260 ms
entrance without clipping or deforming content. T2 initial movement and Haze
remain intact; send cleanup is independent and handles delayed destinations,
failure/navigation, offscreen or resized destinations, reduced motion and
unmount. Rollback: revert only T3 changes in ChatPage, the hook and feedback CSS.

Final checks passed: `npm run typecheck`, `npm run lint`, `npm run build`,
changed-source `npx prettier --check`, and `git diff --check`. Real-time offline
Chrome passed 58 normal and 47 native reduced-motion assertions. Commands:
`node /tmp/talo-chat-offline-fixture/build.mjs`,
`node /tmp/talo-signature-cdp-check.mjs`, and
`node /tmp/talo-signature-cdp-check.mjs --reduced`.
Separate reports: `/tmp/talo-signature-normal-results.json` and
`/tmp/talo-signature-reduced-results.json`. Native completion fired in both.
Parent inspected start, early, mid and clean-landing PNGs under
`/tmp/talo-signature-normal-*.png`; early ink stays visible and the real message
is restored cleanly. Initial virtual-time/frame-readiness attempts failed to
observe the transfer; real-time checks resolved that environment limitation.
An offscreen-destination assertion exposed a cleanup edge, which was fixed and
verified. Desktop visual feel remains unverified; no real provider calls were
made. T3 committed with code and verification evidence within these limits.
Next: assess the motion in the desktop window when available.

Engram mirror: observation `994`, topic `odd/chat-view-transition/tasks`,
project `talo`, containing this full document and its repository-relative locator.
