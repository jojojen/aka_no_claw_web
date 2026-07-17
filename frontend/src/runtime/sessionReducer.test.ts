import { describe, expect, it } from "vitest";
import { emptySessionRuntime, parseSessionRunEvent } from "./events";
import { sessionReducer } from "./sessionReducer";

const event = (seq: number, type: string, payload: Record<string, unknown> = {}) => ({
  event_version: 1 as const, event_id: `e-${seq}`, session_id: "s1", run_id: "r1", seq,
  occurred_at: seq, type, visibility: "user" as const, payload,
});

describe("sessionReducer", () => {
  it("projects messages and ignores a duplicate", () => {
    const first = event(1, "user.message", { text: "hello" });
    const state = sessionReducer(emptySessionRuntime(), first);
    expect(state.messageOrder).toEqual(["e-1"]);
    expect(sessionReducer(state, first)).toBe(state);
  });

  it("does not allow a terminal run to regress", () => {
    const done = sessionReducer(emptySessionRuntime(), event(1, "run.completed"));
    const later = sessionReducer(done, event(2, "run.started"));
    expect(later.runsById.r1.status).toBe("completed");
  });

  it("does not advance across a missing cursor", () => {
    const state = sessionReducer(emptySessionRuntime(), event(1, "run.started"));
    const gap = sessionReducer(state, event(3, "run.completed"));
    expect(gap.cursor).toBe(1);
    expect(gap.diagnostic).toContain("缺口");
  });

  it("projects structured tool progress without changing the run status", () => {
    const running = sessionReducer(emptySessionRuntime(), event(1, "run.started"));
    const progress = sessionReducer(running, event(2, "tool.progress", { stage: "search" }));
    expect(progress.runsById.r1.status).toBe("running");
    expect(progress.runsById.r1.stages.search).toBe("running");
  });

  it("validates envelopes before the reducer sees them", () => {
    expect(parseSessionRunEvent({ event_version: 2 })).toBeNull();
    expect(parseSessionRunEvent(event(1, "unknown.future"))).not.toBeNull();
  });
});
