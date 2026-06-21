# Learning Path for OpenClaw Web

## Purpose

This note is the shortest useful learning path for keeping up with the current
`aka_no_claw_web` and `aka_no_claw` architecture decisions.

It is not a general AI curriculum.

It is focused on the exact problems this system will hit:

- long chat output
- streaming and cancellation
- local model vs cloud backend abstraction
- mobile web UI responsiveness
- future agent/tool execution boundaries

---

## First Principle

Do not start by learning a new framework.

For this project, the main risks are not:

- React vs Vue
- FastAPI vs another Python web framework
- Python vs Rust

The main risks are:

- blocking request/response design for long model output
- poor cancellation handling
- backend workers continuing after client disconnect
- local/cloud model adapters drifting apart
- adding tool-calling before plain chat is stable

So the learning order should match those risks.

---

## Reading Order

### 1. Read the project spec first

Read:

- [LOCAL_MOBILE_CONSOLE_MVP.md](/Users/jen/ai_work_space/related_to_claw/aka_no_claw_web/docs/LOCAL_MOBILE_CONSOLE_MVP.md)

What to extract:

- Phase 1 is pure chat only
- user can choose `local` or `cloud_pickle`
- long chat output must stream or use equivalent job/polling
- tool-calling is a later phase

If this document is not clear, everything else will be learned out of context.

---

### 2. Learn browser-native streaming

Read:

- MDN SSE / EventSource  
  <https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events>
- MDN ReadableStream / Fetch streaming / AbortController  
  <https://developer.mozilla.org/en-US/docs/Web/API/Streams_API/Using_readable_streams>

What to learn:

- when SSE is a good fit
- when `fetch()` streaming is a better fit
- how partial chunks are consumed incrementally
- how `AbortController` stops an in-flight request
- why one final JSON response is bad for long chat output

What you should be able to answer after reading:

- Why does a long model reply look like a freeze if the backend only returns one final JSON payload?
- What is the difference between `EventSource` and streamed `fetch()`?
- How should the UI keep partial output when the request is cancelled or breaks?

---

### 3. Learn Python backend streaming and cancellation

Read:

- FastAPI `StreamingResponse`  
  <https://fastapi.tiangolo.com/advanced/custom-response/#streamingresponse>

What to learn:

- how Python generators stream bytes/chunks
- why async generators need an `await` point
- how cancellation behaves when the client disconnects
- why long-running streams can leak work if cancellation is ignored

What you should be able to answer:

- Why can a worker keep running after the user closes the page?
- Why does an async generator need to yield control to the event loop?
- What is the minimum shape of a safe chat stream endpoint?

---

### 4. Learn local model API structure

Read:

- Ollama API introduction  
  <https://docs.ollama.com/api/introduction>

What to learn:

- how a local model is wrapped behind HTTP
- how one runtime can expose both local and cloud endpoints
- what a stable backend adapter boundary looks like

What you should be able to answer:

- How do we hide backend differences behind one `chat_backend` field?
- What should remain the same whether the model is local or cloud?
- Which parts belong to the UI, and which belong to the backend adapter?

---

### 5. Learn how to keep the UI responsive during generation

Read:

- React `useTransition`  
  <https://react.dev/reference/react/useTransition>

What to learn:

- pending UI state
- non-blocking updates
- separating typing/input responsiveness from rendering work

What you should be able to answer:

- How should the UI show "generating" without locking the input?
- Which state updates should be treated as non-urgent?
- Why is frontend responsiveness not solved by changing frameworks alone?

---

## What Not to Study First

Do not start here:

- Rust web backends
- Angular architecture
- full agent frameworks
- generic "learn AI agents" videos
- vector DB / RAG tutorials unrelated to this repo

Reason:

Those topics are not the current bottleneck.

Right now the system wins or fails on:

- stable chat request contract
- reliable long-output streaming
- cancellation behavior
- clean local/cloud backend abstraction

---

## Phase-Based Knowledge Goals

### Phase 1

Goal:

```text
Selectable pure chat with long-output streaming
```

You should understand:

- request/response contract design
- streaming events
- partial rendering
- cancellation
- local vs cloud backend selection

You do not need yet:

- tool execution planning
- multi-step agent orchestration
- `/help` capability routing

### Phase 2

Goal:

```text
Tool-capable chat agent
```

Only after Phase 1 is stable, study:

- tool registry design
- constrained command execution
- progress events for long jobs
- audit logs for tool calls
- fallback and retry behavior

---

## Recommended Personal Study Loop

Use this loop instead of passive reading:

1. Read one official doc.
2. Write down the failure mode it prevents.
3. Map that failure mode to this system.
4. Update the spec or implementation decision only if the mapping is concrete.

Example:

```text
ReadableStream + AbortController
→ failure mode: user cannot stop long output
→ system impact: chat page feels frozen / leaks work
→ action: require cancel control and backend disconnect handling
```

This is the fastest way to build useful system intuition.

---

## Strong Recommendation

If you want to keep up with future optimization work, aim to become fluent in
these four topics first:

- HTTP streaming
- cancellation and timeouts
- Python async/generator behavior
- adapter design for multiple model backends

That knowledge will pay off immediately in this project.

Switching frameworks will not.
