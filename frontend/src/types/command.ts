// Mirror of the aka_no_claw command bridge contract
// (docs/LOCAL_MOBILE_CONSOLE_MVP.md → aka_no_claw#30). The web app treats the
// bridge as an external local API and never reimplements routing.

export type Mode = "chat" | "translation" | "investment" | "life";
export type ChatBackend = "local" | "cloud_mistral" | "gemini" | "cloud_pickle" | "cloud_nvidia" | "cloud_pool";
export type LlmProvider = "gemini" | "mistral" | "big_pickle" | "local" | "nvidia";

export type Submode =
  | "text_translation"
  | "image_translation"
  | "deep_product_research"
  | "seller_reputation_snapshot";

export type Attachment = {
  type: string;
  filename?: string;
  content_type?: string;
  // Base64-encoded raw bytes (no data: URL prefix). The bridge decodes these
  // and runs the real OCR + translation pipeline (aka_no_claw#43).
  data_base64?: string;
};

// One prior visible chat turn sent inline so the bridge can answer follow-ups
// in context (aka_no_claw#44). Best-effort context only — the bridge sanitizes
// and trims it server-side.
export type ChatHistoryItem = {
  role: MessageRole;
  content: string;
};

export type WebCommandRequest = {
  mode: Mode;
  submode?: Submode | null;
  input: string;
  chat_backend?: ChatBackend;
  attachments?: Attachment[];
  source: string;
  // Chat continuity (#44): recent turns + stable ids. Only sent for chat mode.
  history?: ChatHistoryItem[];
  session_id?: string;
  conversation_id?: string;
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

export type ModelAttempt = {
  provider: string;
  model: string;
  status: string;
  reason?: string;
};

export type ModelMetadata = {
  requested_provider: string;
  requested_model: string;
  attempted_models: ModelAttempt[];
  final_provider: string;
  final_model: string;
  fallback_reason?: string;
  fallback_occurred?: boolean;
  requested_tab?: string;
};

export type ModelRoute = {
  backend: ChatBackend;
  label: string;
  requested_provider: string;
  requested_model: string;
  chain: { provider: string; model: string }[];
  configured: boolean;
};

export type VisionRoute = {
  label: string;
  requested_provider: string;
  requested_model: string;
  chain: { provider: string; model: string }[];
};

export type ModelRoutesResponse = {
  status: ResponseStatus;
  routes: ModelRoute[];
  vision?: VisionRoute | null;
  message?: string;
};

export type ChatSettingsProvider = {
  label: string;
  enabled: boolean;
  model: string;
  configured: boolean;
};

export type ChatSettings = {
  default_chat_provider: ChatBackend;
  cloud_pool: Exclude<LlmProvider, "local">[];
  default_provider_options: { value: ChatBackend; label: string }[];
  providers: Record<LlmProvider, ChatSettingsProvider>;
  model_options: Record<LlmProvider, string[]>;
  vision_pool: LlmProvider[];
  vision_providers: Partial<Record<LlmProvider, ChatSettingsProvider>>;
  vision_model_options: Partial<Record<LlmProvider, string[]>>;
};

export type ChatSettingsResponse = {
  status: ResponseStatus;
  settings?: ChatSettings;
  message?: string;
  local_reload?: {
    status: "ok" | "error" | "skipped";
    model?: string;
    previous_model?: string;
    message?: string;
  };
};

export type CommandResponse = {
  status: ResponseStatus;
  message: string;
  mode?: Mode;
  submode?: string | null;
  actions?: CommandAction[];
  warnings?: string[];
  sources?: CommandSource[];
  model_metadata?: ModelMetadata;
};

// Speech-to-text bridge response. The request sends the MediaRecorder/native
// capture Blob as multipart FormData; the local bridge owns model loading and
// transcription so no audio leaves the operator's machine.
export type TranscriptionResponse = {
  status: "ok" | "error";
  transcript?: string;
  message?: string;
};

// Streaming events from POST /api/command/stream (NDJSON).
export type StreamEvent =
  | { type: "start"; request_id: string }
  | { type: "delta"; text: string }
  | { type: "heartbeat" }
  | { type: "done"; message: string; model_metadata?: ModelMetadata; actions?: CommandAction[] }
  | { type: "error"; message: string }
  | { type: "redirect"; intent: string; description: string; workflow_id?: string }
  | { type: "process"; text: string };

// Async job model from POST /api/command/async + GET /api/command/poll.
// Long commands (deep product research) run decoupled from the connection so a
// mobile screen-lock or dropped socket can't lose the result — the client polls.
export type AsyncStartResponse = {
  status: "accepted" | "error";
  job_id?: string;
  message?: string;
};

export type JobStatus = "running" | "done" | "error" | "interrupted";

// A follow-up button (龍蝦's /research views: 摘要 / 看市價 / 看賣家 …). The
// callback_data is opaque to the UI — clicking re-invokes the bridge handler.
export type ActionButton = {
  label: string;
  callback_data: string;
  row?: number;
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

export type RestartAllResponse = {
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
  modelMetadata?: ModelMetadata;
  // Goal-loop control buttons (continue/stop/save) delivered on stream "done".
  // Not scoped to a jobId like ActionButton -- dispatch resends action.input
  // as the next chat turn instead of hitting the job-action endpoint.
  chatActions?: CommandAction[];
  // Accumulated vision analysis narration from "process" stream events.
  // Rendered as a collapsed disclosure above the answer body; excluded from
  // the history payload sent to the bridge (must not enter model context).
  processText?: string;
};
