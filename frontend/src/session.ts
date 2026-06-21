// Session snapshot <-> in-app state conversion + a tiny debounce (web#2).
//
// The Mac mini backend (aka_no_claw#32) owns the session JSON. This module is
// the pure, testable seam between that snapshot and the console's React state:
// it builds the snapshot we POST, and sanitizes a snapshot we GET so a corrupt
// or unexpected payload can never crash the UI — bad data simply degrades to a
// blank/usable console (fail soft).

import type {
  ChatBackend,
  Message,
  MessageRole,
  Mode,
  ResponseStatus,
  SessionSnapshot,
  Submode,
} from "./types/command";

const MODES: readonly Mode[] = ["chat", "translation", "investment", "life"];
const BACKENDS: readonly ChatBackend[] = ["local", "cloud_pickle"];
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

// Build the snapshot to persist. active_job_id is the most recent real research
// job (music's sentinel job id is excluded — it isn't pollable on restore).
export function toSnapshot(state: AppSessionState): SessionSnapshot {
  let activeJobId: string | null = null;
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const jid = state.messages[i].jobId;
    if (jid && jid !== "__music__") {
      activeJobId = jid;
      break;
    }
  }
  return {
    messages: state.messages,
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
  return msg;
}

// Coerce any GET payload into a complete RestoredState. Unknown / corrupt /
// partial input collapses to a blank console instead of throwing.
export function fromSnapshot(raw: unknown): RestoredState {
  const blank: RestoredState = {
    messages: [],
    mode: "chat",
    chatBackend: "local",
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
    chatBackend: oneOf(s.chat_backend, BACKENDS) ? (s.chat_backend as ChatBackend) : "local",
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
