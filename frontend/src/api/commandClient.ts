import type {
  ActionResponse,
  ApprovalEventPage,
  ApprovalView,
  AsyncStartResponse,
  CancelJobResponse,
  ChatSettings,
  ChatSettingsResponse,
  ContextStatusResponse,
  CommandResponse,
  JobPollResponse,
  ModelRoutesResponse,
  PromptIntent,
  PromptQueueResponse,
  QueuedPrompt,
  RestartAllResponse,
  SessionClearResponse,
  SessionLoadResponse,
  SessionSaveResponse,
  SessionSnapshot,
  StreamEvent,
  TranscriptionResponse,
  WebCommandRequest,
} from "../types/command";
import { emptySnapshot } from "../session";
import { getOrCreateSessionId } from "../session";
import { envelopeVersionError } from "./envelope";

const COMMAND_URL = "/api/command";
const STREAM_URL = "/api/command/stream";
const ASYNC_URL = "/api/command/async";
const POLL_URL = "/api/command/poll";
const ACTION_URL = "/api/command/action";
const CANCEL_URL = "/api/command/cancel";
const MUSIC_URL = "/api/command/music";
const NOW_PLAYING_URL = "/api/command/music/now";
const BLUETOOTH_URL = "/api/command/bluetooth";
const IR_URL = "/api/command/ir";
const WORKFLOW_URL = "/api/command/workflow";
const APPROVAL_URL = "/api/command/approval";
const QUEUE_URL = "/api/command/queue";
const CONTEXT_URL = "/api/command/context";
const SCHEDULE_URL = "/api/command/schedulehome";
const SESSION_URL = "/api/command/session";
const RESTART_ALL_URL = "/api/command/restartall";
const MODEL_ROUTES_URL = "/api/command/model-routes";
const CHAT_SETTINGS_URL = "/api/command/chat-settings";
const TRANSCRIBE_URL = "/api/command/transcribe";
const VOICE_CONFIRM_URL = "/api/command/voice/confirm";
const VOICE_FEEDBACK_URL = "/api/command/voice/feedback";

function streamUrlCandidates(): string[] {
  if (typeof window === "undefined") return [STREAM_URL];
  const urls = [STREAM_URL];
  const { protocol, hostname, port } = window.location;
  if (hostname && port !== "8781") {
    urls.unshift(`${protocol}//${hostname}:8781${STREAM_URL}`);
  }
  return Array.from(new Set(urls));
}

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
  const data = (await res.json()) as CommandResponse;
  const envelopeError = envelopeVersionError(data);
  if (envelopeError) return { status: "error", message: envelopeError };
  return data;
}

// Local speech-to-text. Audio bytes are sent to the command bridge, which runs
// the configured open-source transcription model and returns plain text.
export async function transcribeAudio(
  audio: Blob,
): Promise<TranscriptionResponse> {
  try {
    const mimeType = audio.type.split(";", 1)[0].toLowerCase();
    const extensions: Record<string, string> = {
      "audio/aac": "aac",
      "audio/flac": "flac",
      "audio/m4a": "m4a",
      "audio/mp4": "m4a",
      "audio/mpeg": "mp3",
      "audio/ogg": "ogg",
      "audio/wav": "wav",
      "audio/wave": "wav",
      "audio/webm": "webm",
      "audio/x-m4a": "m4a",
      "audio/x-wav": "wav",
    };
    const extension = extensions[mimeType] ?? "audio";
    const body = new FormData();
    body.append("file", audio, `recording.${extension}`);
    const res = await fetch(TRANSCRIBE_URL, {
      method: "POST",
      // Do not set Content-Type: fetch adds multipart/form-data plus boundary.
      body,
    });
    let data: TranscriptionResponse;
    try {
      data = (await res.json()) as TranscriptionResponse;
    } catch {
      return { status: "error", message: `HTTP ${res.status}` };
    }
    if (!res.ok) {
      return { status: "error", message: data.message || `HTTP ${res.status}` };
    }
    return data;
  } catch (err) {
    return { status: "error", message: String(err) };
  }
}

// Execute a voice clarification candidate (aka_no_claw#82 PR1). Only the
// action_id (+ the opaque single-use learning token, PR3) is submitted — the
// bridge re-reads its action registry and re-validates availability/risk
// server-side before dispatching, so labels, payloads and risk levels shown
// in the UI are never trusted.
export async function confirmVoiceAction(
  actionId: string,
  learningToken?: string,
): Promise<ActionResponse> {
  try {
    const res = await fetch(VOICE_CONFIRM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action_id: actionId,
        ...(learningToken ? { learning_token: learningToken } : {}),
      }),
    });
    return (await res.json()) as ActionResponse;
  } catch (err) {
    return { status: "error", message: String(err) };
  }
}

// Negative feedback「不是這個」against the prototype behind a direct dispatch
// (aka_no_claw#82 PR4, design §7.6). Fail-soft like confirmVoiceAction.
export async function reportVoiceDirectRejection(
  prototypeId: string,
): Promise<ActionResponse> {
  try {
    const res = await fetch(VOICE_FEEDBACK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prototype_id: prototypeId }),
    });
    return (await res.json()) as ActionResponse;
  } catch (err) {
    return { status: "error", message: String(err) };
  }
}

// Streaming chat — consumes NDJSON over fetch ReadableStream. Cancellable via
// the provided AbortSignal. Each parsed event is delivered to onEvent.
//
// A malformed line, invalid event shape, or unsupported envelope is a corrupt
// or incompatible transport boundary.  Report it explicitly and terminate the
// stream; continuing could let a later `done` overwrite the error and make a
// corrupted stream look like an empty/successful response (#77).
export async function streamCommand(
  req: WebCommandRequest,
  onEvent: (event: StreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const body = JSON.stringify(req);
  let res: Response | null = null;
  let lastError: unknown = null;
  for (const url of streamUrlCandidates()) {
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal,
      });
      if (res.ok && res.body) break;
      if (url !== STREAM_URL) {
        res = null;
        continue;
      }
      break;
    } catch (err) {
      lastError = err;
      if (url === STREAM_URL) throw err;
    }
  }
  if (!res && lastError) throw lastError;
  if (!res) throw new Error("stream connection failed");
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

  const emitLine = (line: string): boolean => {
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      onEvent({
        type: "error",
        failure_state: "corrupt",
        message: "command bridge NDJSON 串流資料毀損，已停止接收；請重新執行。",
      });
      return false;
    }
    if (!event || typeof event !== "object" || Array.isArray(event) ||
        typeof (event as { type?: unknown }).type !== "string") {
      onEvent({
        type: "error",
        failure_state: "corrupt",
        message: "command bridge NDJSON 串流事件格式毀損，已停止接收；請重新執行。",
      });
      return false;
    }
    const envelopeError = envelopeVersionError(event);
    if (envelopeError) {
      onEvent({ type: "error", failure_state: "incompatible", message: envelopeError });
      return false;
    }
    onEvent(event as StreamEvent);
    return true;
  };

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
      if (!emitLine(line)) {
        await reader.cancel("invalid command bridge NDJSON stream");
        return;
      }
    }
  }
  const tail = buffer.trim();
  if (tail) emitLine(tail);
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

// Cooperative cancel of a running job (#81): the bridge sets the job's cancel
// flag and the worker stops at its next safe point (per-search / heartbeat /
// stage boundary). Fail-soft — the stop button must never throw.
export async function cancelJob(jobId: string): Promise<CancelJobResponse> {
  try {
    const res = await fetch(CANCEL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: jobId }),
    });
    try {
      return (await res.json()) as CancelJobResponse;
    } catch {
      return { status: "error", message: `HTTP ${res.status}` };
    }
  } catch (err) {
    return { status: "error", message: String(err) };
  }
}

export async function loadPromptQueue(sessionId: string): Promise<PromptQueueResponse> {
  try {
    const res = await fetch(`${QUEUE_URL}?session_id=${encodeURIComponent(sessionId)}`);
    return (await res.json()) as PromptQueueResponse;
  } catch (err) {
    return { status: "error", message: String(err) };
  }
}

export async function createPromptQueueEntry(
  request: WebCommandRequest,
  intent: PromptIntent = "next_turn",
): Promise<PromptQueueResponse> {
  try {
    const res = await fetch(QUEUE_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request, intent }),
    });
    return (await res.json()) as PromptQueueResponse;
  } catch (err) {
    return { status: "error", message: String(err) };
  }
}

export async function cancelPromptQueueEntry(entry: QueuedPrompt): Promise<PromptQueueResponse> {
  try {
    const params = new URLSearchParams({ session_id: entry.session_id, expected_version: String(entry.version) });
    const res = await fetch(`${QUEUE_URL}/${encodeURIComponent(entry.prompt_id)}?${params}`, { method: "DELETE" });
    return (await res.json()) as PromptQueueResponse;
  } catch (err) {
    return { status: "error", message: String(err) };
  }
}

export async function editPromptQueueEntry(entry: QueuedPrompt, text: string): Promise<PromptQueueResponse> {
  try {
    const res = await fetch(`${QUEUE_URL}/${encodeURIComponent(entry.prompt_id)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: entry.session_id, expected_version: entry.version, text }),
    });
    return (await res.json()) as PromptQueueResponse;
  } catch (err) {
    return { status: "error", message: String(err) };
  }
}

export async function retryPromptQueueEntry(entry: QueuedPrompt): Promise<PromptQueueResponse> {
  try {
    const res = await fetch(`${QUEUE_URL}/${encodeURIComponent(entry.prompt_id)}/retry`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: entry.session_id, expected_version: entry.version }),
    });
    return (await res.json()) as PromptQueueResponse;
  } catch (err) {
    return { status: "error", message: String(err) };
  }
}

export async function reorderPromptQueue(entries: QueuedPrompt[]): Promise<PromptQueueResponse> {
  if (!entries.length) return { status: "ok", entries: [] };
  try {
    const res = await fetch(`${QUEUE_URL}/reorder`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: entries[0].session_id,
        prompt_ids: entries.map((entry) => entry.prompt_id),
        expected_versions: Object.fromEntries(entries.map((entry) => [entry.prompt_id, entry.version])),
      }),
    });
    return (await res.json()) as PromptQueueResponse;
  } catch (err) {
    return { status: "error", message: String(err) };
  }
}

export async function getContextStatus(sessionId: string): Promise<ContextStatusResponse> {
  try {
    const res = await fetch(`${CONTEXT_URL}?session_id=${encodeURIComponent(sessionId)}`);
    const data = (await res.json()) as ContextStatusResponse;
    return res.ok ? data : { status: "error", message: data.message || `HTTP ${res.status}` };
  } catch (err) {
    return { status: "error", message: String(err) };
  }
}

export async function compactContext(sessionId: string): Promise<ContextStatusResponse> {
  try {
    const res = await fetch(`${CONTEXT_URL}/compact`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: sessionId }),
    });
    return (await res.json()) as ContextStatusResponse;
  } catch (err) {
    return { status: "error", message: String(err) };
  }
}

export async function clearContextCheckpoint(sessionId: string): Promise<ContextStatusResponse> {
  try {
    const res = await fetch(`${CONTEXT_URL}/checkpoint?session_id=${encodeURIComponent(sessionId)}`, { method: "DELETE" });
    return (await res.json()) as ContextStatusResponse;
  } catch (err) {
    return { status: "error", message: String(err) };
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

export async function getModelRoutes(): Promise<ModelRoutesResponse> {
  try {
    const res = await fetch(MODEL_ROUTES_URL);
    if (!res.ok) {
      return { status: "error", routes: [], message: `HTTP ${res.status}` };
    }
    return (await res.json()) as ModelRoutesResponse;
  } catch (err) {
    return { status: "error", routes: [], message: String(err) };
  }
}

export async function getChatSettings(): Promise<ChatSettingsResponse> {
  try {
    const res = await fetch(CHAT_SETTINGS_URL);
    if (!res.ok) {
      return { status: "error", message: `HTTP ${res.status}` };
    }
    return (await res.json()) as ChatSettingsResponse;
  } catch (err) {
    return { status: "error", message: String(err) };
  }
}

export async function saveChatSettings(settings: ChatSettings): Promise<ChatSettingsResponse> {
  try {
    const res = await fetch(CHAT_SETTINGS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    return (await res.json()) as ChatSettingsResponse;
  } catch (err) {
    return { status: "error", message: String(err) };
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

// --- 生活 mode: IR / home-appliance shortcuts --------------------------------
// 家電 buttons are command shortcuts only. The OpenClaw bridge owns `/ir` routing,
// BroadLink discovery/auth, and stored IR payloads.
export async function runIrCommand(input: string): Promise<ActionResponse> {
  try {
    const body = input.startsWith("ir:")
      ? { callback_data: input }
      : { input };
    const res = await fetch(IR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await res.json()) as ActionResponse;
  } catch (err) {
    return { status: "error", message: String(err) };
  }
}

// --- workflow creation loop (web#8) -----------------------------------------
// The workflow endpoint handles both NL draft creation ("create <description>")
// and wfe:* editor button callbacks (reorder / delete / save / cancel a draft).
// The bridge tracks the editor session in memory, so input and button callbacks
// against the same _WF_WEB_CHAT_ID are automatically correlated server-side.

export async function runWorkflowCommand(input: string, chatBackend?: string): Promise<ActionResponse> {
  try {
    const body = {
      input,
      session_id: getOrCreateSessionId(),
      ...(chatBackend ? { chat_backend: chatBackend } : {}),
    };
    const res = await fetch(WORKFLOW_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await res.json()) as ActionResponse;
  } catch (err) {
    return { status: "error", message: String(err) };
  }
}

export async function runWorkflowAction(callbackData: string): Promise<ActionResponse> {
  try {
    const res = await fetch(WORKFLOW_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_data: callbackData }),
    });
    return (await res.json()) as ActionResponse;
  } catch (err) {
    return { status: "error", message: String(err) };
  }
}

export async function resolveApproval(approval: ApprovalView, decision: "approve" | "reject"): Promise<ActionResponse> {
  if (!approval.decision_token) {
    return { status: "error", message: "核准憑證不存在或已失效。" };
  }
  try {
    const res = await fetch(APPROVAL_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approval_id: approval.approval_id, session_id: approval.session_id,
        run_id: approval.run_id, decision_token: approval.decision_token, decision }),
    });
    const data = (await res.json()) as ActionResponse;
    if (!res.ok) return { status: "error", message: data.message || `HTTP ${res.status}` };
    if (data.approval && !isApprovalView(data.approval, false)) {
      return { status: "error", message: "核准回覆格式無效。" };
    }
    return data;
  } catch (err) {
    return { status: "error", message: String(err) };
  }
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isApprovalView(value: unknown, requireToken = true): value is ApprovalView {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.approval_id === "string" && typeof item.session_id === "string" &&
    typeof item.run_id === "string" && typeof item.manifest_hash_prefix === "string" &&
    typeof item.expires_at === "number" && typeof item.risk === "string" &&
    typeof item.action_kind === "string" && typeof item.status === "string" &&
    (!requireToken || typeof item.decision_token === "string") &&
    stringArray(item.requested_capabilities) && stringArray(item.network_scopes) &&
    stringArray(item.filesystem_scopes) && stringArray(item.device_scopes);
}

export async function loadPendingApprovals(sessionId: string): Promise<ApprovalView[]> {
  const requested = new Map<string, ApprovalView>();
  const resolved = new Set<string>();
  let after: number | undefined;
  for (let pageNumber = 0; pageNumber < 20; pageNumber += 1) {
    const query = new URLSearchParams({ session_id: sessionId, limit: "500" });
    if (after !== undefined) query.set("after", String(after));
    const res = await fetch(`/api/command/events?${query.toString()}`);
    const page = (await res.json()) as ApprovalEventPage;
    if (!res.ok || page.status !== "ok" || !Array.isArray(page.events)) {
      throw new Error(page.message || `HTTP ${res.status}`);
    }
    for (const event of page.events) {
      if (event.type === "approval.requested" && isApprovalView(event.payload)) {
        requested.set(event.payload.approval_id, event.payload);
      } else if (event.type === "approval.resolved" && event.payload &&
        typeof event.payload === "object" &&
        typeof (event.payload as { approval_id?: unknown }).approval_id === "string") {
        resolved.add((event.payload as { approval_id: string }).approval_id);
      }
    }
    if (!page.has_more) break;
    if (typeof page.server_cursor !== "number") throw new Error("核准事件 cursor 無效。")
    after = page.server_cursor;
  }
  return [...requested.values()].filter((approval) => !resolved.has(approval.approval_id));
}

export async function runScheduleHomeCommand(input: string): Promise<ActionResponse> {
  try {
    const res = await fetch(SCHEDULE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input }),
    });
    return (await res.json()) as ActionResponse;
  } catch (err) {
    return { status: "error", message: String(err) };
  }
}

export async function runScheduleHomeAction(callbackData: string): Promise<ActionResponse> {
  try {
    const res = await fetch(SCHEDULE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_data: callbackData }),
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
export async function loadSession(sessionId?: string): Promise<SessionLoadResponse> {
  try {
    const url = sessionId
      ? `${SESSION_URL}?session_id=${encodeURIComponent(sessionId)}`
      : SESSION_URL;
    const res = await fetch(url);
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
  sessionId?: string,
): Promise<SessionSaveResponse> {
  try {
    const url = sessionId
      ? `${SESSION_URL}?session_id=${encodeURIComponent(sessionId)}`
      : SESSION_URL;
    const res = await fetch(url, {
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
export async function clearSession(sessionId?: string): Promise<SessionClearResponse> {
  try {
    const url = sessionId
      ? `${SESSION_URL}?session_id=${encodeURIComponent(sessionId)}`
      : SESSION_URL;
    const res = await fetch(url, { method: "DELETE" });
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
