// Mirror of the aka_no_claw command bridge contract
// (docs/LOCAL_MOBILE_CONSOLE_MVP.md → aka_no_claw#30). The web app treats the
// bridge as an external local API and never reimplements routing.

export type Mode = "chat" | "translation" | "investment" | "life";
export type ChatBackend = "local" | "cloud_pickle";

export type Submode =
  | "text_translation"
  | "image_translation"
  | "deep_product_research"
  | "seller_reputation_snapshot";

export type Attachment = {
  type: string;
  filename?: string;
  content_type?: string;
};

export type WebCommandRequest = {
  mode: Mode;
  submode?: Submode | null;
  input: string;
  chat_backend?: ChatBackend;
  attachments?: Attachment[];
  source: string;
};

export type ResponseStatus = "ok" | "partial" | "error" | "unsupported";

export type CommandAction = {
  label: string;
  command: string;
  input?: string;
};

export type CommandSource = {
  source_id?: string;
  title?: string;
  url?: string;
  domain?: string;
};

export type CommandResponse = {
  status: ResponseStatus;
  message: string;
  mode?: Mode;
  submode?: string | null;
  actions?: CommandAction[];
  warnings?: string[];
  sources?: CommandSource[];
};

// Streaming events from POST /api/command/stream (NDJSON).
export type StreamEvent =
  | { type: "start"; request_id: string }
  | { type: "delta"; text: string }
  | { type: "heartbeat" }
  | { type: "done"; message: string }
  | { type: "error"; message: string };

// Async job model from POST /api/command/async + GET /api/command/poll.
// Long commands (deep product research) run decoupled from the connection so a
// mobile screen-lock or dropped socket can't lose the result — the client polls.
export type AsyncStartResponse = {
  status: "accepted" | "error";
  job_id?: string;
  message?: string;
};

export type JobStatus = "running" | "done" | "error";

// A follow-up button (龍蝦's /research views: 摘要 / 看市價 / 看賣家 …). The
// callback_data is opaque to the UI — clicking re-invokes the bridge handler.
export type ActionButton = {
  label: string;
  callback_data: string;
};

export type JobPollResponse = {
  job_status: JobStatus;
  progress?: string[];
  message?: string;
  actions?: ActionButton[];
  error?: string | null;
  not_found?: boolean;
};

export type ActionResponse = {
  status: ResponseStatus;
  message: string;
  actions?: ActionButton[];
};

// Server-side session snapshot (aka_no_claw#32 / web#2). The Mac mini owns this
// JSON; the console restores it on open and writes it back (debounced) so a page
// reload / browser close / reconnect doesn't lose recent chat + research output.
// Field names mirror the backend contract (snake_case), not the in-app state.
export type SessionSnapshot = {
  schema_version?: number;
  messages: Message[];
  mode: Mode | null;
  chat_backend: ChatBackend | null;
  investment_submode: Submode | null;
  active_job_id: string | null;
  updated_at?: number | null;
};

export type SessionLoadResponse = {
  status: "ok" | "error";
  session: SessionSnapshot;
  message?: string;
};

export type SessionSaveResponse = {
  status: "ok" | "error";
  updated_at?: number;
  message?: string;
};

export type SessionClearResponse = {
  status: "ok" | "error";
  message?: string;
};

// UI-side conversation model (shared across all modes).
export type MessageRole = "user" | "assistant" | "system";

export type Message = {
  id: string;
  role: MessageRole;
  text: string;
  modeLabel?: string;
  status?: ResponseStatus;
  generating?: boolean;
  actions?: ActionButton[];
  jobId?: string;
};
