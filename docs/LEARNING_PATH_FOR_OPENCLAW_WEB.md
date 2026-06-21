# Decision Guide for OpenClaw Web

## Purpose

This note is for product and architecture decisions.

It is not a coding guide.

The goal is to help the owner of the system make good decisions about scope,
sequencing, risk, and technical direction without needing to care about
implementation details.

---

## What Matters

For this project, the important decisions are not:

- React vs Vue
- FastAPI vs another Python framework
- Python vs Rust

Those are secondary.

The primary decisions are:

- whether Phase 1 stays small enough to finish
- whether long chat output is handled safely
- whether local and cloud model backends share one stable product contract
- whether tool-calling is delayed until plain chat is reliable

---

## Phase 1 Decision

Phase 1 should remain:

```text
Selectable pure chat
```

That means:

- user can choose `local`
- user can choose `cloud_pickle`
- user sends a normal chat message
- system returns a normal chat response

That also means Phase 1 should not include:

- tool-calling
- `/help` capability execution
- command planning
- multi-step agent workflows
- background job orchestration beyond what is required for long-output chat safety

Why:

If Phase 1 includes both model selection and tool execution, the project will
mix three hard problems at once:

- model backend abstraction
- long-output chat UX
- agent/tool reliability

That is the fastest path to delay and instability.

---

## Long Output Decision

Long chat output is a product decision, not just an implementation detail.

If the system waits for one final JSON response before rendering anything, the
UI will feel frozen during long replies.

So the correct product decision is:

```text
Phase 1 chat must stream output or use equivalent job/polling behavior.
```

This is required because the user experience otherwise looks like:

- nothing happens
- the page feels hung
- the user cannot tell whether the model is still working
- cancel/retry behavior becomes unclear

The exact implementation can vary.

The decision does not.

---

## Backend Choice Decision

Keep the backend inside `aka_no_claw` and keep it in Python for Phase 1.

Reason:

- existing OpenClaw logic already lives there
- model routing and later tool integration will live there
- moving Phase 1 to Rust creates integration cost without solving the main risk

Rust is not the bottleneck right now.

The bottleneck is stable chat behavior under long output.

---

## Frontend Choice Decision

Keep the frontend simple.

React + Vite + TypeScript is already good enough for the decision space here.

Do not switch frameworks unless there is a specific product problem that React
cannot solve.

Right now there is no such problem.

Vue would also work.

Angular is likely too heavy for this product stage.

Changing frontend framework now is more likely to consume time than reduce risk.

---

## Model Abstraction Decision

The product should treat model choice as:

```text
one chat feature
multiple backends
```

This means the visible product contract should stay stable while the backend
changes underneath.

The user-facing choice is:

- `local`
- `cloud_pickle`

What should stay the same across both:

- one chat input
- one conversation stream
- one cancel/retry mental model
- one error-handling style

If local and cloud produce completely different product behavior, the system
will become harder to reason about and harder to maintain.

---

## Phase 2 Decision

Tool-calling belongs to Phase 2.

Only start it after Phase 1 is stable in these areas:

- model selection works
- long output feels reliable
- cancel/retry behavior is clear
- local and cloud backends behave similarly enough

If those are not stable yet, adding tools will make debugging much slower.

---

## Minimal Theory To Understand

You do not need deep mathematics or computer science theory for this project.

You only need a lightweight understanding of the ideas below because they help
you make correct decisions.

### 1. State machine thinking

You should think of the chat system as moving through states:

```text
idle -> running -> streaming -> done / error / cancelled
```

Why this matters:

- it prevents incomplete specs
- it forces cancel/error states to be designed explicitly
- it makes "looks frozen" problems easier to identify

### 2. Synchronous vs asynchronous work

You do not need formal concurrency theory.

You do need to understand one product truth:

```text
long-running model work must not block the whole user experience
```

Why this matters:

- it explains why streaming or job/polling is required
- it explains why "wait for final JSON" feels broken
- it explains why cancel and retry need explicit design

### 3. Queueing and backpressure

You only need the intuition, not the equations.

If the model produces output or receives requests faster than the UI/backend can
handle them, the system starts to lag, pile up work, or fail unpredictably.

Why this matters:

- it supports timeout and concurrency limits
- it explains why Phase 1 should stay small
- it explains why too many simultaneous concerns make the system brittle

### 4. Timeouts, retries, and cancellation

You do not need distributed systems theory in depth.

You do need to remember:

- a timeout does not always mean the work stopped
- a retry can create duplicate work
- a cancel action may not stop the underlying worker immediately

Why this matters:

- it affects product trust
- it affects whether "retry" is safe
- it affects whether backend cleanup is mandatory

### 5. Abstraction boundaries

This is software design more than theory.

The useful idea is:

```text
different implementations should still present one stable product contract
```

Why this matters:

- local and cloud chat should feel like one feature
- backend swaps should not force frontend redesign
- Phase 2 tool-calling should build on the same contract rather than replace it

### 6. Complexity control

You do not need advanced algorithm analysis.

You only need the management intuition:

```text
every extra concern added to Phase 1 multiplies uncertainty
```

Why this matters:

- it justifies delaying tool-calling
- it helps you reject oversized proposals
- it keeps the system debuggable

---

## What To Ignore

You can safely ignore most implementation details for now:

- React component structure
- exact endpoint code
- async generator patterns
- stream parser code
- SSE formatting details
- Python cancellation mechanics

Those are implementation concerns for the agent.

You only need to care about whether the chosen direction is correct.

---

## Questions To Ask During Review

When reviewing future proposals or PRs, these are the useful questions:

1. Does this keep Phase 1 small?
2. Does this make long chat output feel reliable?
3. Does this preserve one clean contract for `local` and `cloud_pickle`?
4. Does this avoid prematurely adding tool-calling?
5. Does this reduce future complexity, or only move it around?

If a proposal cannot answer those questions clearly, it is probably not ready.

---

## Bottom Line

The highest-value knowledge for you is not implementation knowledge.

It is decision knowledge:

- what to build first
- what to delay
- what risks actually matter
- what technical choices are real constraints versus distractions

For this system, the core judgment is:

```text
Make Phase 1 a reliable selectable-chat product.
Do not turn it into a full agent too early.
```
