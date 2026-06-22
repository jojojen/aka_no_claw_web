import type {
  ActionResponse,
  AsyncStartResponse,
  CommandResponse,
  JobPollResponse,
  RestartAllResponse,
  SessionClearResponse,
  SessionLoadResponse,
  SessionSaveResponse,
  SessionSnapshot,
  StreamEvent,
  WebCommandRequest,
} from "../types/command";
import { emptySnapshot } from "../session";

const COMMAND_URL = "/api/command";
const STREAM_URL = "/api/command/stream";
const ASYNC_URL = "/api/command/async";
const POLL_URL = "/api/command/poll";
const ACTION_URL = "/api/command/action";
const MUSIC_URL = "/api/command/music";
const NOW_PLAYING_URL = "/api/command/music/now";
const BLUETOOTH_URL = "/api/command/bluetooth";
const SESSION_URL = "/api/command/session";
const RESTART_ALL_URL = "/api/command/restartall";

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

// Click a research follow-up button — re-invokes the bridge callback handler
// (switch view) and returns the new text + buttons.
export async function runAction(
  jobId: string,
  callbackData: string,
): Promise<ActionResponse> {
  const res = await fetch(ACTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ job_id: jobId, callback_data: callbackData }),
  });
  try {
    return (await res.json()) as ActionResponse;
  } catch {
    return { status: "error", message: `HTTP ${res.status}` };
  }
}

// --- 生活 mode: music control surface (aka_no_claw_web#3 / #4) -------------
// The phone is a remote controller: every music interaction goes through the
// bridge's /api/command/music route. The browser never scans the filesystem or
// plays audio — it just renders the backend's text + action buttons.

// Run the /music handler for the 生活 text box: an empty input returns the
// music menu, a query plays/searches a song.
export async function runMusicCommand(input: string): Promise<ActionResponse> {
  return postMusic({ input });
}

// Re-invoke a music callback button (browse / play / favorite / volume). The
// callback_data is opaque to the UI; the backend re-validates any path stays
// under OPENCLAW_MUSIC_DIR before acting.
export async function runMusicAction(callbackData: string): Promise<ActionResponse> {
  return postMusic({ callback_data: callbackData });
}

async function postMusic(body: Record<string, string>): Promise<ActionResponse> {
  try {
    const res = await fetch(MUSIC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await res.json()) as ActionResponse;
  } catch (err) {
    return { status: "error", message: String(err) };
  }
}

// Name of the song the Mac mini is currently playing, or null when idle. Used by
// 生活 mode to show a small now-playing strip. Fails soft to null so a dropped
// poll never disrupts the panel.
export async function getNowPlaying(): Promise<string | null> {
  try {
    const res = await fetch(NOW_PLAYING_URL);
    if (!res.ok) return null;
    const data = (await res.json()) as { status?: string; name?: string | null };
    return typeof data?.name === "string" ? data.name : null;
  } catch {
    return null;
  }
}

// --- 生活 mode: bluetooth control surface (aka_no_claw#38 / web#7) ----------
// Same remote-controller model as music: the browser never touches the OS
// Bluetooth stack. An empty body scans devices; a callback_data connects/refreshes.
// Device buttons carry backend-generated opaque tokens — the UI never builds MACs.

// Scan Bluetooth devices and return the device list + connect buttons.
export async function runBluetoothScan(): Promise<ActionResponse> {
  return postBluetooth({});
}

// Re-invoke a bluetooth callback button (connect a device / re-scan). The
// callback_data is opaque to the UI; the backend resolves the token to a MAC and
// re-validates it before connecting.
export async function runBluetoothAction(callbackData: string): Promise<ActionResponse> {
  return postBluetooth({ callback_data: callbackData });
}

async function postBluetooth(body: Record<string, string>): Promise<ActionResponse> {
  try {
    const res = await fetch(BLUETOOTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await res.json()) as ActionResponse;
  } catch (err) {
    return { status: "error", message: String(err) };
  }
}

// --- server-side session memory (aka_no_claw#32 / web#2) -------------------
// The Mac mini owns the console session so a reload / reconnect restores it.

// GET the latest saved snapshot. A network/HTTP/JSON failure degrades to an
// empty session marked with status "error" so the caller can show an in-app
// notice and still start from a blank, usable console (never a browser alert).
export async function loadSession(): Promise<SessionLoadResponse> {
  try {
    const res = await fetch(SESSION_URL);
    if (!res.ok) {
      return { status: "error", session: emptySnapshot(), message: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as SessionLoadResponse;
    if (!data || typeof data !== "object" || !data.session) {
      return { status: "error", session: emptySnapshot(), message: "回應格式錯誤" };
    }
    return data;
  } catch (err) {
    return { status: "error", session: emptySnapshot(), message: String(err) };
  }
}

// POST a snapshot (the body IS the snapshot). Never throws: a failed save must
// not break the in-progress conversation — the caller keeps using the runtime
// state and we just report the failure for an optional non-blocking notice.
export async function saveSession(
  snapshot: SessionSnapshot,
): Promise<SessionSaveResponse> {
  try {
    const res = await fetch(SESSION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshot),
    });
    const data = (await res.json()) as SessionSaveResponse;
    return data;
  } catch (err) {
    return { status: "error", message: String(err) };
  }
}

// DELETE the saved snapshot (clear memory). Idempotent on the backend.
export async function clearSession(): Promise<SessionClearResponse> {
  try {
    const res = await fetch(SESSION_URL, { method: "DELETE" });
    const data = (await res.json()) as SessionClearResponse;
    return data;
  } catch (err) {
    return { status: "error", message: String(err) };
  }
}

// POST a local service restart request. The backend replies before it stops the
// bridge process, so a success response means "scheduled", not "already back".
export async function restartAll(): Promise<RestartAllResponse> {
  try {
    const res = await fetch(RESTART_ALL_URL, { method: "POST" });
    const data = (await res.json()) as RestartAllResponse;
    return data;
  } catch (err) {
    return { status: "error", message: String(err) };
  }
}
