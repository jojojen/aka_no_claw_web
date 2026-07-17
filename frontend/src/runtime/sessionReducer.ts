import { emptySessionRuntime, type SessionRunEvent, type SessionRuntimeState } from "./events";

const terminal = new Set(["completed", "failed", "cancelled", "interrupted"]);
const statusFor: Record<string, string> = {
  "run.accepted": "queued", "run.started": "running", "run.completed": "completed", "run.failed": "failed",
  "run.cancel_requested": "cancel_requested", "run.cancelled": "cancelled", "run.interrupted": "interrupted",
};

export { emptySessionRuntime };

export function sessionReducer(state: SessionRuntimeState, event: SessionRunEvent): SessionRuntimeState {
  if (state.seenEventIds[event.event_id] || event.seq <= state.cursor) return state;
  if (state.sessionId && state.sessionId !== event.session_id) return { ...state, diagnostic: "事件 session 不一致，已忽略。" };
  if (event.seq !== state.cursor + 1 && state.cursor !== 0) return { ...state, diagnostic: "事件 cursor 有缺口，需重新同步。" };
  const next: SessionRuntimeState = {
    ...state, sessionId: event.session_id, cursor: event.seq,
    seenEventIds: { ...state.seenEventIds, [event.event_id]: true }, diagnostic: undefined,
  };
  if (event.type === "user.message" || event.type === "assistant.message") {
    const text = event.payload.text;
    if (typeof text === "string") {
      next.messagesById = { ...state.messagesById, [event.event_id]: {
        id: event.event_id, role: event.type === "user.message" ? "user" : "assistant", text,
      } };
      next.messageOrder = [...state.messageOrder, event.event_id];
    }
    return next;
  }
  if (event.type === "context.checkpoint") {
    next.context = event.payload.deleted === true ? { deleted: true } : {
      checkpointId: typeof event.payload.checkpoint_id === "string" ? event.payload.checkpoint_id : undefined,
      summaryPreview: typeof event.payload.summary_preview === "string" ? event.payload.summary_preview : undefined,
    };
    return next;
  }
  if (event.type === "tool.progress") {
    const previous = state.runsById[event.run_id];
    if (previous && terminal.has(previous.status)) return next;
    const stages = { ...(previous?.stages ?? {}) };
    if (typeof event.payload.stage === "string") stages[event.payload.stage] = "running";
    next.runsById = {
      ...state.runsById,
      [event.run_id]: {
        id: event.run_id,
        status: previous?.status ?? "running",
        updatedAt: event.occurred_at,
        stages,
      },
    };
    return next;
  }
  const status = statusFor[event.type];
  if (!status) return next; // Future additive event: cursor advances, projection does not change.
  const previous = state.runsById[event.run_id];
  if (previous && terminal.has(previous.status) && !terminal.has(status)) return next;
  const stages = { ...(previous?.stages ?? {}) };
  next.runsById = { ...state.runsById, [event.run_id]: { id: event.run_id, status, updatedAt: event.occurred_at, stages } };
  return next;
}
