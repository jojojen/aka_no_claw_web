import { afterEach, describe, expect, it, vi } from "vitest";
import type { Message, SessionSnapshot } from "./types/command";
import {
  debounce,
  emptySnapshot,
  fromSnapshot,
  toSnapshot,
} from "./session";

describe("fromSnapshot — restore / fail soft", () => {
  it("restores a well-formed snapshot", () => {
    const snap: SessionSnapshot = {
      messages: [
        { id: "1", role: "user", text: "hi" },
        {
          id: "2",
          role: "assistant",
          text: "yo",
          status: "ok",
          modeLabel: "Chat",
          jobId: "job-9",
          actions: [{ label: "看市價", callback_data: "pg:mb:0:r" }],
        },
      ],
      mode: "investment",
      chat_backend: "cloud_pickle",
      investment_submode: "seller_reputation_snapshot",
      active_job_id: "job-9",
    };
    const st = fromSnapshot(snap);
    expect(st.mode).toBe("investment");
    expect(st.chatBackend).toBe("cloud_pickle");
    expect(st.investmentSubmode).toBe("seller_reputation_snapshot");
    expect(st.activeJobId).toBe("job-9");
    expect(st.messages).toHaveLength(2);
    expect(st.messages[1].actions).toEqual([
      { label: "看市價", callback_data: "pg:mb:0:r" },
    ]);
  });

  it("never restores a generating spinner", () => {
    const st = fromSnapshot({
      messages: [{ id: "1", role: "assistant", text: "half", generating: true }],
    });
    expect(st.messages[0].generating).toBe(false);
  });

  it("drops malformed messages but keeps valid ones", () => {
    const st = fromSnapshot({
      messages: [
        { id: "1", role: "user", text: "ok" },
        { role: "user", text: "no id" },
        { id: "3", role: "bogus", text: "bad role" },
        "not even an object",
        { id: "5", role: "assistant", text: "fine" },
      ],
    });
    expect(st.messages.map((m) => m.id)).toEqual(["1", "5"]);
  });

  it("falls soft to a blank console on garbage payloads", () => {
    for (const bad of [null, undefined, 42, "x", [1, 2, 3]]) {
      const st = fromSnapshot(bad);
      expect(st.messages).toEqual([]);
      expect(st.mode).toBe("chat");
      expect(st.chatBackend).toBe("local");
      expect(st.investmentSubmode).toBe("deep_product_research");
      expect(st.activeJobId).toBeNull();
    }
  });

  it("coerces unknown enum values to safe defaults", () => {
    const st = fromSnapshot({
      messages: [],
      mode: "wat",
      chat_backend: "openai",
      investment_submode: "telepathy",
      active_job_id: 12345,
    });
    expect(st.mode).toBe("chat");
    expect(st.chatBackend).toBe("local");
    expect(st.investmentSubmode).toBe("deep_product_research");
    expect(st.activeJobId).toBeNull();
  });
});

describe("toSnapshot — persist", () => {
  const base = {
    mode: "chat" as const,
    chatBackend: "local" as const,
    investmentSubmode: "deep_product_research" as const,
  };

  it("picks the latest real research job id, skipping the music sentinel", () => {
    const messages: Message[] = [
      { id: "a", role: "assistant", text: "", jobId: "job-1" },
      { id: "b", role: "assistant", text: "", jobId: "job-2" },
      { id: "c", role: "assistant", text: "", jobId: "__music__" },
    ];
    expect(toSnapshot({ ...base, messages }).active_job_id).toBe("job-2");
  });

  it("emits null active_job_id when there is no research job", () => {
    const messages: Message[] = [
      { id: "a", role: "user", text: "hi" },
      { id: "b", role: "assistant", text: "", jobId: "__music__" },
    ];
    expect(toSnapshot({ ...base, messages }).active_job_id).toBeNull();
  });

  it("round-trips through fromSnapshot", () => {
    const messages: Message[] = [{ id: "1", role: "user", text: "hi" }];
    const snap = toSnapshot({ ...base, mode: "life", messages });
    const st = fromSnapshot(snap);
    expect(st.mode).toBe("life");
    expect(st.messages).toHaveLength(1);
  });
});

describe("emptySnapshot", () => {
  it("is an empty, null-valued snapshot", () => {
    expect(emptySnapshot()).toEqual({
      messages: [],
      mode: null,
      chat_backend: null,
      investment_submode: null,
      active_job_id: null,
    });
  });
});

describe("debounce — save batching", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("collapses a burst into a single trailing call with the last args", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 800);
    d("a");
    d("b");
    d("c");
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(800);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("c");
  });

  it("flush() fires the pending call immediately", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 800);
    d("x");
    d.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("x");
  });

  it("cancel() discards the pending call", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 800);
    d("x");
    d.cancel();
    vi.advanceTimersByTime(800);
    expect(fn).not.toHaveBeenCalled();
  });
});
