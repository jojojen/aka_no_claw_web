# Aka No Claw Web Agent Control Plane Implementation Plan

Last reviewed: 2026-07-17
Status: Current
Owner area: Web application / bridge consumer
Tracking issue: [`aka_no_claw_web#12`](https://github.com/jojojen/aka_no_claw_web/issues/12)
Backend plans:

- `jojojen/aka_no_claw/docs/WEB_SESSION_RUN_EVENT_SPINE_IMPLEMENTATION_PLAN.md`
- `jojojen/aka_no_claw/docs/WEB_DYNAMIC_TOOL_APPROVAL_IMPLEMENTATION_PLAN.md`
- `jojojen/aka_no_claw/docs/WEB_PROMPT_QUEUE_IMPLEMENTATION_PLAN.md`
- `jojojen/aka_no_claw/docs/WEB_CONVERSATION_COMPACTION_IMPLEMENTATION_PLAN.md`

## Read This First

This is the canonical Web implementation plan for consuming the bridge's
replayable event/runtime contracts. It owns client event normalization, cursor
recovery, React state architecture, run/task presentation, prompt queue UX,
approval cards, context controls, mobile/accessibility behavior, migration from
the current snapshot model, tests, rollout, and rollback.

The Web remains a local-only, mobile-first, single-operator console. This plan
does not turn it into a generic SaaS dashboard.

Read before editing:

- `docs/LOCAL_MOBILE_CONSOLE_MVP.md`
- `README.md`
- `frontend/src/App.tsx`
- `frontend/src/session.ts`
- `frontend/src/types/command.ts`
- `frontend/src/api/commandClient.ts`
- `frontend/src/components/ConversationStream.tsx`
- `frontend/src/components/MessageBubble.tsx`
- `frontend/src/components/InputBar.tsx`
- reconnect/stream/cancel/workflow/schedule/voice tests
- all four backend plans above

## 1. Current Reality

The current Web already has valuable production behavior:

- typed command/stream/job/session DTOs;
- NDJSON streaming with explicit corrupt/incompatible errors;
- `AbortController` transport cancellation;
- server-side job cancellation;
- stream-loss handoff to job polling;
- persisted session restoration from the Mac mini;
- voice capture, clarification, direct-action feedback;
- workflow/schedule capture loops;
- model route/fallback metadata;
- broad regression coverage.

The limiting architecture is concentrated in `App.tsx`:

- approximately 1,564 lines;
- many independent `useState`/`useRef` variables encode one implicit state
  machine;
- one global `generating` flag and one `activeJobIdRef` represent all work;
- two polling loops repeat terminal/progress handling;
- `__music__`, `__bluetooth__`, `__appliance__`, `__workflow__`, and
  `__schedule__` sentinel job IDs mix UI card identity with backend work;
- free-form `processText` is treated as the progress model;
- restoration uses a whole snapshot and latest job, not a cursor-exact event
  replay;
- the composer cannot naturally accept durable next-turn work while busy.

This plan migrates incrementally. Existing tests and user-visible behavior are
assets, not reasons for a rewrite.

## 2. Outcome

1. Web state is a deterministic projection of versioned bridge events plus
   local ephemeral UI state.
2. It stores the latest server cursor and resumes exactly after reconnect.
3. Multiple runs can be represented simultaneously without concurrent model
   turns sharing mutable context.
4. Chat messages, run progress, queued prompts, approvals, and capture cards
   have distinct typed identities.
5. A compact Task Sheet shows active/recent work without changing the chat-first
   main screen.
6. Composer remains usable while work runs and supports queued next-turn input.
7. Approval requests are safe, reconnectable, and double-submit resistant.
8. Context usage/compaction is inspectable without exposing private reasoning.
9. `App.tsx` becomes a composition root over focused hooks/reducers/components.
10. Old bridge contracts remain supported during staged rollout.

## 3. Product Guardrails

Preserve the MVP identity:

```text
chat-first
mode-switching second
button-assisted
mobile-first
local-only
single-user
```

Do not add:

- desktop-first persistent sidebar;
- account/login/admin system;
- dense multi-session fleet dashboard;
- generic plugin marketplace;
- raw chain-of-thought view;
- WebSocket/relay dependency;
- Redux/XState or another dependency unless native reducer/hooks prove
  insufficient with evidence;
- redesign of every message/result card in the same migration.

## 4. Target Frontend Architecture

```text
App (composition + layout only)
├── SessionRuntimeProvider
│   ├── useSessionBootstrap
│   ├── useSessionEventStream
│   ├── useSessionCursor
│   └── sessionReducer
├── CommandRuntimeProvider
│   ├── useCommandDispatcher
│   ├── useRunManager
│   ├── useRunCancellation
│   └── useLegacyBridgeAdapter
├── usePromptQueue
├── useApprovalController
├── useContextStatus
├── ConversationView
├── TaskSheet
├── QueueStrip
├── ApprovalCard
├── ContextPanel
└── Composer
```

Prefer plain TypeScript reducers and hooks. State transitions must be testable
without rendering the whole app.

## 5. State Ownership

### 5.1 Durable server projection

Derived only from events/API:

- messages;
- runs and stage status;
- active/recent task list;
- prompt queue snapshot;
- approval requests/resolutions;
- context checkpoint metadata;
- server cursor;
- session metadata.

### 5.2 Persisted display preferences

May stay in the session preference/snapshot API:

- selected mode;
- selected chat backend;
- investment/life submode;
- optional compact task display preference.

Preferences never overwrite event-derived run/message history.

### 5.3 Ephemeral UI state

Local React state:

- open/closed modal/sheet;
- current text draft;
- staged File object and object URL;
- recording state;
- temporary optimistic button/spinner state;
- expanded/collapsed progress details.

Do not persist Blob/File data, abort controllers, or temporary confirmation UI.

## 6. Event Client Contract

Add Web DTOs matching event version 1:

```ts
type SessionRunEvent = {
  event_version: 1;
  event_id: string;
  session_id: string;
  run_id: string;
  seq: number;
  occurred_at: number;
  type: SessionEventType;
  visibility: "user" | "debug";
  payload: unknown;
};
```

Parsing rules:

- validate envelope before reducer application;
- reject missing required identifiers/sequence;
- tolerate unknown additive fields;
- store unknown event types only for diagnostics, do not crash projection;
- never cast arbitrary payload directly to a component prop;
- validate per-event payload through small type guards;
- corrupt/incompatible event response is visible and must not advance cursor.

## 7. Session Reducer

Reducer shape:

```ts
type SessionRuntimeState = {
  sessionId: string;
  cursor: number;
  messagesById: Record<string, Message>;
  messageOrder: string[];
  runsById: Record<string, RunView>;
  runOrder: string[];
  queue: PromptQueueView;
  approvalsById: Record<string, ApprovalView>;
  context: ContextView;
  connection: ConnectionView;
};
```

Invariants:

- ignore an already-applied `event_id`/sequence;
- never advance cursor across a missing sequence without explicit server
  bootstrap/retention response;
- a terminal run cannot become running;
- message identity is event-defined, not generated from array index;
- progress stages update by stable stage ID;
- assistant delta is ephemeral until durable message/checkpoint arrives;
- unknown event does not alter known state;
- reducer is pure and deterministic;
- apply batch atomically enough that the UI does not show impossible intermediate
  terminal/running combinations.

Add reducer tests before moving UI logic.

## 8. Bootstrap And Reconnect

### 8.1 Capability negotiation

On startup:

1. load display preferences/legacy snapshot as today;
2. discover whether event v1 endpoint is available;
3. if available, fetch bootstrap events/projection and server cursor;
4. use event runtime as authority;
5. if unavailable, stay on the current legacy adapter with a visible diagnostic
   only when relevant.

Do not infer support from bridge version strings alone; use an explicit endpoint
or response capability.

### 8.2 Cursor persistence

Persist a bounded tuple:

```text
session_id + event_version + last_applied_seq
```

The server remains authoritative. Local cursor storage is an optimization. If
storage is missing/corrupt, bootstrap safely.

### 8.3 Reconnect algorithm

```text
stream drops
  → stop applying transport-only deltas
  → fetch events after last durable cursor
  → validate contiguous server sequences
  → apply/dedup batch
  → if run still active, resume live stream or bounded poll/long-poll
  → if cursor expired, obtain server projection/bootstrap explicitly
```

Retry uses bounded exponential backoff with jitter and a visible offline state.
Do not retry corrupt/incompatible payloads as transient network failures.

## 9. Legacy Adapter

Create a focused adapter that maps current shapes to internal actions while the
bridge rolls out:

- legacy `start/delta/process/job/done/error`;
- async start/poll snapshot;
- saved session snapshot;
- sentinel-backed action cards.

This code is temporary and clearly marked with removal gates. Do not preserve
legacy branches inside every new component.

Removal conditions:

- event spine enabled in production;
- cursor recovery live proof passes;
- all current stream/poll/cancel tests have equivalent event tests;
- one release interval with no legacy-only client requirement.

## 10. Run Manager

`useRunManager` exposes:

```ts
type RunView = {
  id: string;
  kind: string;
  status:
    | "queued"
    | "running"
    | "waiting_confirmation"
    | "completed"
    | "failed"
    | "cancel_requested"
    | "cancelled"
    | "interrupted";
  title: string;
  stages: RunStageView[];
  messageId?: string;
  startedAt?: number;
  updatedAt: number;
  cancellable: boolean;
  recoverable: boolean;
};
```

There is no single global generating truth. The composer/UI derives:

- whether a foreground run is active;
- whether the current capture context is busy;
- whether chat actions should be disabled;
- whether a specific run can be cancelled.

The Stop button targets one run ID. If multiple cancellable runs exist, it opens
the Task Sheet or targets the foreground run explicitly; it never cancels an
unrelated job through a global ref.

## 11. Structured Progress

Replace free-form `processText` as the primary state model with stage events.

Compact message presentation:

```text
✓ 已理解需求
✓ 已選擇商品研究
● 檢查賣家信譽 3/5
○ 最終驗收
```

Rules:

- default view shows one current line plus completed count;
- expandable detail shows user-facing stages and safe diagnostics;
- do not label private reasoning as "分析過程";
- transport heartbeat is invisible;
- raw tool output is not dumped into chat;
- failures show category, stage, and next action where available;
- screen readers receive meaningful stage transitions, not every token.

## 12. Task Sheet

Add one small top-level `任務` control with badge count. It opens a mobile bottom
sheet, not a permanent dashboard.

Rows show:

- title/kind;
- status;
- current stage/progress;
- elapsed/updated time as secondary text;
- cancel/retry/open-in-chat actions where valid.

Include active runs and a bounded recent terminal list. Keep schedules/workflows
as their existing product surfaces; only current executions appear as runs.

No subagent tree, fleet monitoring, pinned sessions, or dense charts.

## 13. Prompt Queue UX

When a foreground run is active:

- composer stays enabled;
- send defaults to `排到下一則`;
- if the run advertises safe interjection, user may choose `補充目前任務`;
- queued prompts appear above composer as compact rows/chips;
- edit/cancel/reorder only while server state is queued;
- optimistic mutation reconciles against server version conflict;
- capture-mode prompts retain explicit editor context;
- attachments show expiry/upload errors before queue acceptance.

Implement `usePromptQueue` against the backend plan's authoritative API/events.
Do not keep a second client-only queue that can disappear on reload.

## 14. Approval UX

Render `approval.requested` as a dedicated card associated with run/message.

Required fields:

- action title and concise purpose;
- risk in plain language;
- concrete effects grouped by network/files/device/schedule;
- expiry/resolved status;
- approve-once/reject controls;
- stronger deliberate interaction for destructive actions.

Client safety:

- never decide risk locally;
- submit opaque ID/token only;
- immediately lock controls after one submission;
- reconcile final state from event;
- reconnect restores pending request;
- expired/hash-mismatch/policy-change state is explicit;
- no global permanent allow.

## 15. Context/Compaction UX

Add a compact context section to settings/session info:

- category-based usage indicator;
- checkpoint time and summary preview;
- `查看摘要`;
- `壓縮對話內容` when manual action is allowed;
- `清除摘要記憶` separate from `清除整段對話`.

Automatic compaction appears as a low-noise system notice. Never expose chain-of-
thought or claim token precision unsupported by the backend estimator.

## 16. Session Scope Decision

Keep one active session in v1. Do not build a Grok-like multi-session dashboard.

Nevertheless:

- all state is keyed by `session_id`;
- reducer and cursor stores prevent cross-session leakage;
- a future session picker can be added without schema replacement;
- `new/clear` semantics must explicitly choose whether they create a session,
  clear a projection, clear a journal, or only clear context checkpoint.

Document destructive semantics before changing the existing clear button.

## 17. App Decomposition

Refactor in behavior-preserving slices.

Suggested files:

```text
frontend/src/runtime/events.ts
frontend/src/runtime/eventPayloads.ts
frontend/src/runtime/sessionReducer.ts
frontend/src/runtime/SessionRuntimeProvider.tsx
frontend/src/runtime/useSessionEvents.ts
frontend/src/runtime/useRunManager.ts
frontend/src/runtime/usePromptQueue.ts
frontend/src/runtime/useApprovals.ts
frontend/src/runtime/useContextStatus.ts
frontend/src/runtime/legacyAdapter.ts
frontend/src/components/RunProgress.tsx
frontend/src/components/TaskSheet.tsx
frontend/src/components/QueueStrip.tsx
frontend/src/components/ApprovalCard.tsx
frontend/src/components/ContextPanel.tsx
```

`App.tsx` retains:

- top-level layout;
- mode selection composition;
- high-level callbacks provided by hooks;
- modal/sheet composition.

It no longer owns polling loops, cursor recovery, terminal state transitions,
or sentinel interpretation.

## 18. API Client Plan

Extend `commandClient.ts` through small methods:

- capability discovery;
- fetch events after cursor;
- stream event-v1 request;
- cancel one run;
- queue CRUD/reorder;
- approval resolution;
- context status/compact/delete.

Retain:

- abortable requests;
- envelope version validation;
- bounded body/NDJSON line handling;
- explicit corrupt/incompatible error categories;
- no silent fallback from semantic incompatibility to a different endpoint.

Use one shared decoder for live and replayed event envelopes.

## 19. Delivery Slices

### PR W1 — pure event types/reducer

- event DTO/guards;
- pure reducer and golden traces;
- no production UI behavior change.

### PR W2 — shadow bootstrap/cursor

- capability discovery;
- fetch and project event history in shadow mode;
- compare with legacy snapshot/message state;
- diagnostics for divergence.

### PR W3 — event-driven conversation and reconnect

- switch messages/run state to reducer;
- cursor recovery;
- live delta overlay;
- retain legacy adapter fallback.

### PR W4 — Run Manager and Task Sheet

- remove single active job assumption;
- target cancellation by run;
- structured progress;
- mobile task sheet.

### PR W5 — prompt queue

- composer remains enabled;
- queue strip/mutations;
- reconnect/version conflict/capture isolation.

### PR W6 — approval cards

- pending/resolved state;
- one-shot decision;
- destructive interaction/a11y;
- mismatch/expiry UX.

### PR W7 — context controls

- usage/checkpoint status;
- manual compact/inspect/clear summary;
- distinguish session clear semantics.

### PR W8 — legacy cleanup

- remove duplicate polling loops and sentinel IDs;
- reduce `App.tsx` to composition role;
- remove legacy adapter after compatibility gate;
- update MVP contract and README.

## 20. Test Strategy

### Pure reducer traces

- bootstrap history;
- duplicate event;
- missing sequence;
- unknown event;
- accepted → running → progress → completed;
- cancel requested vs late completion;
- multiple runs;
- queue mutation/version conflict;
- pending/resolved/expired approval;
- context checkpoint;
- terminal state cannot regress;
- timestamps do not affect projection.

### Transport/reconnect

- disconnect before/after every durable event;
- live/replay duplicate overlap;
- corrupt line does not advance cursor;
- incompatible version visible;
- expired cursor bootstrap;
- transient network backoff;
- mobile screen lock simulation;
- bridge restart interrupted run;
- completed background result appears once.

### Components

- Task Sheet mobile behavior;
- targeted cancel/retry;
- structured progress collapsed/expanded;
- queue edit/cancel/reorder;
- interjection unavailable/available;
- approval double click/reconnect/expiry/destructive gesture;
- context inspect/clear distinction;
- existing voice/workflow/schedule/action flows remain correct;
- no top-level control wraps against MVP mobile guardrail;
- keyboard and screen-reader labels.

### Existing regression suite

Preserve and migrate coverage from:

- `App.reconnect.test.tsx`
- `App.streamRecover.test.tsx`
- `App.stopCancel.test.tsx`
- `App.workflow.test.tsx`
- `App.schedule.test.tsx`
- voice/audio/image/chat/history/settings tests
- command client/envelope/session/component tests

Run the complete frontend suite, typecheck, and production build before each
delivery report.

### Live browser validation

After backend implementation is restarted through the supported stack flow:

1. desktop and phone-width smoke;
2. ordinary streaming chat;
3. long run with lock/reopen cursor recovery;
4. background completion while Web is closed;
5. two visible runs/tasks without state collision;
6. targeted cancellation;
7. queued next turn and safe interjection;
8. approval approve/reject/expire;
9. context checkpoint inspect/clear;
10. voice, workflow, schedule, music, Bluetooth, and appliance regression.

Use `aka_no_claw/docs/BROWSER_UI_VALIDATION_PLAYBOOK.md` and show actual fresh
outputs rather than only reporting green tests.

## 21. Migration And Rollout

Feature flags/capabilities:

```text
event_v1
cursor_replay
multi_run_projection
prompt_queue_v1
approval_v1
context_checkpoint_v1
```

Rollout order follows backend readiness. An unsupported capability hides its UI
instead of exposing a dead control. Legacy snapshot remains until W8.

During shadow phase, compare:

- visible messages;
- active job/run identity;
- final status/result;
- selected preferences;
- action availability.

Record divergences locally without exporting message content.

## 22. Failure UX

Differentiate:

- offline/transient connection;
- corrupt event stream;
- incompatible event version;
- expired cursor requiring bootstrap;
- interrupted worker after restart;
- cancelled run;
- approval expired/mismatch;
- queue conflict;
- compaction unavailable.

Do not collapse these into `無法連線`. Each has a safe next action. Never show
an empty successful assistant bubble after a corrupt stream.

## 23. Observability And Privacy

Local diagnostics may record:

- connection/reconnect outcome;
- event type/count/sequence gaps;
- run duration/status/category;
- queue and approval decision category;
- compaction timing/token estimates.

Do not log:

- full user prompts by default;
- attachment contents;
- approval tokens;
- generated source;
- private reasoning;
- secrets or complete local paths.

## 24. Progress / Handoff Checklist

Implementation is rolling out incrementally.  The reducer foundation and
context-control slice shipped on 2026-07-17 while the legacy adapter remains
the authority for existing stream/poll/action surfaces.

### W1 — reducer foundation

- [x] W1.1 define event DTO and payload guards from backend golden fixtures.
- [x] W1.2 implement pure session reducer and invariants.
- [x] W1.3 add complete lifecycle trace tests.
- [x] W1.4 model local ephemeral vs durable state explicitly.

### W2 — shadow event runtime

- [ ] W2.1 add capability discovery/event client.
- [ ] W2.2 add cursor persistence and bootstrap.
- [ ] W2.3 compare event projection against legacy snapshot in tests/shadow mode.
- [ ] W2.4 classify corrupt/incompatible/expired-cursor failures.

### W3 — authority migration

- [ ] W3.1 drive messages/runs from reducer.
- [ ] W3.2 add live delta overlay and replay dedup.
- [ ] W3.3 implement reconnect/backoff.
- [ ] W3.4 migrate reconnect/stream recovery tests.

### W4 — run/task UI

- [ ] W4.1 implement `useRunManager` and targeted cancellation.
- [ ] W4.2 implement structured progress.
- [ ] W4.3 implement mobile Task Sheet.
- [ ] W4.4 prove multiple runs do not collide.

### W5 — queue

- [ ] W5.1 implement queue client/hook.
- [ ] W5.2 keep composer enabled and add next/interjection intent.
- [ ] W5.3 add queue strip/mutations/reconnect.
- [ ] W5.4 prove capture isolation.

### W6 — approval

- [x] W6.1 implement approval payload guard/controller.
- [x] W6.2 render safe effect summary and actions.
- [ ] W6.3 add reconnect/double-submit/expiry/mismatch tests.
- [ ] W6.4 add stronger destructive confirmation interaction.

### W7 — context

- [x] W7.1 implement status/usage client.
- [x] W7.2 implement inspect/manual compact/clear summary UI.
- [x] W7.3 separate summary clear from full session clear.

### W8 — cleanup/release

- [ ] W8.1 remove duplicated polling/terminal handling.
- [ ] W8.2 remove sentinel job IDs.
- [ ] W8.3 reduce `App.tsx` to composition root.
- [ ] W8.4 complete full automated and live mobile regression.
- [ ] W8.5 update README/MVP contract/issue handoff.

## 25. Rollback

- Keep event authority, task UI, queue, approval, and context UI behind separate
  backend capabilities.
- The legacy adapter remains until each feature has a proven fallback window.
- A Web rollback does not mutate/delete backend journals, queues, approvals, or
  checkpoints.
- If event projection diverges, disable authority switch and retain shadow
  diagnostics; do not merge conflicting states heuristically.
- Do not restore sentinel IDs after their backend/card replacements ship; roll
  back the complete relevant slice instead.

## 26. Exit Gate

This plan is complete only when the Web is a deterministic, cursor-recoverable
projection of bridge events; multiple runs are represented safely; background
completion, targeted cancellation, queue, approval, and context controls work
after reload; `App.tsx` no longer owns orchestration state; legacy contracts are
removed only after their gates; the full suite/typecheck/build pass; and actual
phone/desktop flows are verified against the restarted production bridge.
