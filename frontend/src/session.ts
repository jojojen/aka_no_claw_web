// Session snapshot <-> in-app state conversion + a tiny debounce (web#2).
//
// The Mac mini backend (aka_no_claw#32) owns the session JSON. This module is
// the pure, testable seam between that snapshot and the console's React state:
// it builds the snapshot we POST, and sanitizes a snapshot we GET so a corrupt
// or unexpected payload can never crash the UI — bad data simply degrades to a
// blank/usable console (fail soft).

import type {
  ChatBackend,
  ChatHistoryItem,
  Message,
  MessageRole,
  Mode,
  ResponseStatus,
  SessionSnapshot,
  Submode,
} from "./types/command";

// Stable per-browser ids for chat continuity (#44). The session id survives
// reloads via localStorage; conversation id is a single rolling thread for now.
const SESSION_ID_KEY = "akanoclaw.web.session_id";
export const CONVERSATION_ID = "default";
// Only chat bubbles carry this label; history must never leak other modes.
const CHAT_MODE_LABEL = "Chat";
const DEFAULT_HISTORY_TURNS = 10;
// Per-turn hard cap, and a cumulative budget across kept turns so a few long
// turns can't bloat the prompt (mirrors the bridge's MAX_HISTORY_TOTAL_CHARS).
const DEFAULT_HISTORY_CHARS = 4000;
const DEFAULT_HISTORY_TOTAL_CHARS = 4000;

export function getOrCreateSessionId(): string {
  try {
    const existing = localStorage.getItem(SESSION_ID_KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(SESSION_ID_KEY, id);
    return id;
  } catch {
    // Private mode / storage disabled: fall back to an ephemeral id.
    return `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

// Extract recent chat turns to send as inline context. Only real, finished chat
// bubbles (not the in-flight assistant placeholder, not other modes) qualify.
export function buildChatHistory(
  messages: Message[],
  opts: { maxTurns?: number; maxChars?: number; maxTotalChars?: number } = {},
): ChatHistoryItem[] {
  const maxTurns = opts.maxTurns ?? DEFAULT_HISTORY_TURNS;
  const maxChars = opts.maxChars ?? DEFAULT_HISTORY_CHARS;
  const maxTotalChars = opts.maxTotalChars ?? DEFAULT_HISTORY_TOTAL_CHARS;
  const valid: ChatHistoryItem[] = [];
  for (const m of messages) {
    if (m.modeLabel !== CHAT_MODE_LABEL) continue;
    if (m.generating) continue;
    if (m.role !== "user" && m.role !== "assistant") continue;
    const content = m.text.trim();
    if (!content) continue;
    valid.push({ role: m.role, content: content.slice(0, maxChars) });
  }
  // Keep the most recent turns within both a turn-count and a cumulative
  // character budget; walk newest->oldest then restore chronological order.
  const kept: ChatHistoryItem[] = [];
  let total = 0;
  for (let i = valid.length - 1; i >= 0; i--) {
    if (kept.length >= maxTurns) break;
    total += valid[i].content.length;
    // Always keep at least the newest turn even if it alone exceeds budget.
    if (total > maxTotalChars && kept.length) break;
    kept.push(valid[i]);
  }
  kept.reverse();
  return kept;
}

const MODES: readonly Mode[] = ["chat", "translation", "investment", "life"];
const BACKENDS: readonly ChatBackend[] = ["cloud_pool", "local", "cloud_mistral", "gemini", "cloud_pickle", "cloud_nvidia"];
const SUBMODES: readonly Submode[] = [
  "text_translation",
  "image_translation",
  "deep_product_research",
  "seller_reputation_snapshot",
];
const ROLES: readonly MessageRole[] = ["user", "assistant", "system"];
const STATUSES: readonly ResponseStatus[] = ["ok", "partial", "error", "unsupported"];

export function emptySnapshot(): SessionSnapshot {
  return {
    messages: [],
    mode: null,
    chat_backend: null,
    investment_submode: null,
    active_job_id: null,
  };
}

// State the console restores from a saved snapshot. Always a complete, valid
// object — even from garbage input — so callers never branch on partial data.
export type RestoredState = {
  messages: Message[];
  mode: Mode;
  chatBackend: ChatBackend;
  investmentSubmode: Submode;
  activeJobId: string | null;
};

export type AppSessionState = {
  messages: Message[];
  mode: Mode;
  chatBackend: ChatBackend;
  investmentSubmode: Submode;
};

const _SENTINEL_JOB_IDS = new Set(["__music__", "__bluetooth__", "__appliance__", "__workflow__", "__schedule__"]);

// Build the snapshot to persist. active_job_id is the most recent real research
// job; sentinel ids (music / bluetooth / appliance / workflow cards) are excluded
// since they are not pollable background jobs and carry no reconnect state.
export function toSnapshot(state: AppSessionState): SessionSnapshot {
  let activeJobId: string | null = null;
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const jid = state.messages[i].jobId;
    if (jid && !_SENTINEL_JOB_IDS.has(jid)) {
      activeJobId = jid;
      break;
    }
  }
  return {
    // Approval state is reconstructed from the authoritative event journal.
    // Never copy its bearer token into the legacy snapshot store.
    messages: state.messages.map(({ approval: _approval, approvalResolved: _resolved, ...message }) => message),
    mode: state.mode,
    chat_backend: state.chatBackend,
    investment_submode: state.investmentSubmode,
    active_job_id: activeJobId,
  };
}

function oneOf<T>(value: unknown, allowed: readonly T[]): value is T {
  return allowed.includes(value as T);
}

// Drop any message that lacks the minimum shape; never restore a "generating"
// flag (a half-streamed bubble must come back as static text, not a spinner).
function sanitizeMessage(raw: unknown): Message | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.id !== "string") return null;
  if (!oneOf(m.role, ROLES)) return null;
  const msg: Message = {
    id: m.id,
    role: m.role as MessageRole,
    text: typeof m.text === "string" ? m.text : "",
    generating: false,
  };
  if (typeof m.modeLabel === "string") msg.modeLabel = m.modeLabel;
  if (oneOf(m.status, STATUSES)) msg.status = m.status as ResponseStatus;
  if (typeof m.jobId === "string") msg.jobId = m.jobId;
  if (m.modelMetadata && typeof m.modelMetadata === "object") {
    msg.modelMetadata = m.modelMetadata as Message["modelMetadata"];
  }
  if (Array.isArray(m.actions)) {
    const actions = m.actions.filter(
      (a): a is { label: string; callback_data: string } =>
        !!a &&
        typeof a === "object" &&
        typeof (a as Record<string, unknown>).label === "string" &&
        typeof (a as Record<string, unknown>).callback_data === "string",
    );
    if (actions.length) msg.actions = actions;
  }
  if (typeof m.processText === "string" && m.processText) {
    msg.processText = m.processText;
  }
  return msg;
}

// Coerce any GET payload into a complete RestoredState. Unknown / corrupt /
// partial input collapses to a blank console instead of throwing.
export function fromSnapshot(raw: unknown): RestoredState {
  const blank: RestoredState = {
    messages: [],
    mode: "chat",
    chatBackend: "cloud_pool",
    investmentSubmode: "deep_product_research",
    activeJobId: null,
  };
  if (!raw || typeof raw !== "object") return blank;
  const s = raw as Record<string, unknown>;

  const messages = Array.isArray(s.messages)
    ? s.messages.map(sanitizeMessage).filter((m): m is Message => m !== null)
    : [];

  return {
    messages,
    mode: oneOf(s.mode, MODES) ? (s.mode as Mode) : "chat",
    chatBackend: oneOf(s.chat_backend, BACKENDS) ? (s.chat_backend as ChatBackend) : "cloud_pool",
    investmentSubmode: oneOf(s.investment_submode, SUBMODES)
      ? (s.investment_submode as Submode)
      : "deep_product_research",
    activeJobId: typeof s.active_job_id === "string" ? s.active_job_id : null,
  };
}

// Trailing-edge debounce: collapses a burst of calls (e.g. streaming deltas)
// into a single trailing invocation, so we don't POST on every token.
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number,
): ((...args: A) => void) & { cancel: () => void; flush: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: A | null = null;
  const wrapped = (...args: A): void => {
    pending = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const args2 = pending;
      pending = null;
      if (args2) fn(...args2);
    }, ms);
  };
  wrapped.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pending = null;
  };
  wrapped.flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (pending) {
      const args = pending;
      pending = null;
      fn(...args);
    }
  };
  return wrapped;
}
