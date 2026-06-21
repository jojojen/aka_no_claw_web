# Minimal Knowledge and References for OpenClaw Web

## Minimal Knowledge

### 1. State transitions

Think of chat as moving through states:

```text
idle -> running -> streaming -> done / error / cancelled
```

Why this matters:

- it helps spot incomplete specs
- it makes freeze-like failures easier to identify
- it forces cancel and error states to exist explicitly

### 2. Long work must not block the whole experience

You only need to understand:

```text
long model output cannot wait until one final response blob
```

Why this matters:

- it explains why streaming or job/polling is required
- it explains why a page can feel stuck

### 3. Timeout, retry, cancel

You only need these basic truths:

- timeout does not always mean the work stopped
- retry can create duplicate work
- cancel may not stop the underlying worker immediately

Why this matters:

- it affects trust in the product
- it affects whether retry is safe
- it affects cleanup expectations

### 4. One feature, multiple backends

Treat model choice as:

```text
one chat feature
multiple backends
```

Why this matters:

- `local` and `cloud_pickle` should feel like one feature
- backend changes should not force frontend redesign

### 5. Complexity increases quickly

You only need one management intuition:

```text
every extra concern increases uncertainty and debugging cost
```

Why this matters:

- it helps judge system risk
- it helps explain why reliability drops when too many concerns are mixed together

---

## Reference Materials

### Browser streaming

- MDN: Using server-sent events  
  <https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events>
- MDN: Using readable streams  
  <https://developer.mozilla.org/en-US/docs/Web/API/Streams_API/Using_readable_streams>

### Python backend streaming

- FastAPI: `StreamingResponse`  
  <https://fastapi.tiangolo.com/advanced/custom-response/#streamingresponse>

### Local model API shape

- Ollama API introduction  
  <https://docs.ollama.com/api/introduction>

### Frontend responsiveness

- React: `useTransition`  
  <https://react.dev/reference/react/useTransition>

---

## Extended Reading

### React

- React server streaming reference  
  <https://react.dev/reference/react-dom/server/renderToPipeableStream>

### Browser APIs

- MDN: EventSource reference  
  <https://developer.mozilla.org/en-US/docs/Web/API/EventSource>
- MDN: AbortController reference  
  <https://developer.mozilla.org/en-US/docs/Web/API/AbortController>

### Architecture / observability

- OpenTelemetry documentation  
  <https://opentelemetry.io/docs/>

---

## What You Can Ignore

For now, you can ignore:

- React component structure
- exact endpoint code
- async generator implementation details
- stream parser implementation
- SSE formatting details
- Python cancellation internals

Those are implementation concerns for the agent.
