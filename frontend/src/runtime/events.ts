import type { Message } from "../types/command";

export type SessionEventType =
  | "session.created" | "user.message" | "assistant.message" | "run.accepted"
  | "run.started" | "tool.progress" | "run.completed" | "run.failed"
  | "run.cancel_requested" | "run.cancelled" | "run.interrupted"
  | "queue.changed" | "approval.requested" | "approval.resolved" | "context.checkpoint"
  | (string & {});

export type SessionRunEvent = {
  event_version: 1;
  event_id: string;
  session_id: string;
  run_id: string;
  seq: number;
  occurred_at: number;
  type: SessionEventType;
  visibility: "user" | "internal";
  payload: Record<string, unknown>;
};

export type RunView = { id: string; status: string; updatedAt: number; stages: Record<string, string> };
export type ContextView = { checkpointId?: string; summaryPreview?: string; deleted?: boolean };
export type SessionRuntimeState = {
  sessionId: string | null;
  cursor: number;
  messagesById: Record<string, Message>;
  messageOrder: string[];
  runsById: Record<string, RunView>;
  seenEventIds: Record<string, true>;
  context: ContextView;
  diagnostic?: string;
};

export const emptySessionRuntime = (): SessionRuntimeState => ({
  sessionId: null, cursor: 0, messagesById: {}, messageOrder: [], runsById: {}, seenEventIds: {}, context: {},
});

export function parseSessionRunEvent(value: unknown): SessionRunEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const event = value as Record<string, unknown>;
  if (event.event_version !== 1 || typeof event.event_id !== "string" || typeof event.session_id !== "string" ||
      typeof event.run_id !== "string" || !Number.isInteger(event.seq) || (event.seq as number) < 1 ||
      typeof event.occurred_at !== "number" || typeof event.type !== "string" ||
      (event.visibility !== "user" && event.visibility !== "internal") || !event.payload ||
      typeof event.payload !== "object" || Array.isArray(event.payload)) return null;
  return event as SessionRunEvent;
}
