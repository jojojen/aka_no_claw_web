import type {
  AsyncStartResponse,
  CommandResponse,
  JobPollResponse,
  StreamEvent,
  WebCommandRequest,
} from "../types/command";

const COMMAND_URL = "/api/command";
const STREAM_URL = "/api/command/stream";
const ASYNC_URL = "/api/command/async";
const POLL_URL = "/api/command/poll";

// Blocking call — used for short non-chat commands (translation, research).
export async function sendCommand(req: WebCommandRequest): Promise<CommandResponse> {
  const res = await fetch(COMMAND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data && typeof data.message === "string") message = data.message;
    } catch {
      // keep the HTTP status fallback
    }
    return { status: "error", message };
  }
  return (await res.json()) as CommandResponse;
}

// Streaming chat — consumes NDJSON over fetch ReadableStream. Cancellable via
// the provided AbortSignal. Each parsed event is delivered to onEvent.
export async function streamCommand(
  req: WebCommandRequest,
  onEvent: (event: StreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch(STREAM_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok || !res.body) {
    let message = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data && typeof data.message === "string") message = data.message;
    } catch {
      // keep fallback
    }
    onEvent({ type: "error", message });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line) continue;
      try {
        onEvent(JSON.parse(line) as StreamEvent);
      } catch {
        // ignore malformed line
      }
    }
  }
  const tail = buffer.trim();
  if (tail) {
    try {
      onEvent(JSON.parse(tail) as StreamEvent);
    } catch {
      // ignore
    }
  }
}

// Start a long async job (deep product research). Returns a job_id to poll.
export async function startAsyncCommand(
  req: WebCommandRequest,
): Promise<AsyncStartResponse> {
  const res = await fetch(ASYNC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  try {
    return (await res.json()) as AsyncStartResponse;
  } catch {
    return { status: "error", message: `HTTP ${res.status}` };
  }
}

// Poll a job's staged progress + final report. Each call is a short request, so
// it survives screen-locks / dropped sockets that would kill a held stream.
export async function pollJob(jobId: string): Promise<JobPollResponse> {
  const res = await fetch(`${POLL_URL}?job_id=${encodeURIComponent(jobId)}`);
  return (await res.json()) as JobPollResponse;
}
