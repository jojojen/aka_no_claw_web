// Web#6: job reconnect behavior after page reload.
// Uses a synchronous debounce mock (same as clearMemory tests) so saves are
// immediately observable. pollJob is mocked to control the reconnect path.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("./session", async () => {
  const actual = await vi.importActual<typeof import("./session")>("./session");
  return {
    ...actual,
    debounce: (fn: (...args: unknown[]) => void) => {
      const wrapper = (...args: unknown[]) => fn(...args);
      wrapper.cancel = () => {};
      wrapper.flush = () => {};
      return wrapper;
    },
  };
});

vi.mock("./api/commandClient", () => ({
  loadSession: vi.fn(),
  loadPendingApprovals: vi.fn().mockResolvedValue([]),
  saveSession: vi.fn().mockResolvedValue({ status: "ok" }),
  clearSession: vi.fn(),
  pollJob: vi.fn(),
  getNowPlaying: vi.fn().mockResolvedValue(null),
  getModelRoutes: vi.fn().mockResolvedValue({ status: "ok", routes: [] }),
  getChatSettings: vi.fn().mockResolvedValue({ status: "ok", settings: null }),
  saveChatSettings: vi.fn(),
  sendCommand: vi.fn(),
  streamCommand: vi.fn(),
  reportVoiceDirectRejection: vi.fn(),
  startAsyncCommand: vi.fn(),
  runAction: vi.fn(),
  runMusicAction: vi.fn(),
  runMusicCommand: vi.fn(),
  runBluetoothAction: vi.fn(),
  runBluetoothScan: vi.fn(),
  runIrCommand: vi.fn(),
  runWorkflowCommand: vi.fn(),
  runWorkflowAction: vi.fn(),
  runScheduleHomeCommand: vi.fn(),
  runScheduleHomeAction: vi.fn(),
  restartAll: vi.fn(),
}));

import App from "./App";
import * as client from "./api/commandClient";
import { emptySnapshot } from "./session";

const mockLoad = vi.mocked(client.loadSession);
const mockPoll = vi.mocked(client.pollJob);
const mockSave = vi.mocked(client.saveSession);
const mockStartAsync = vi.mocked(client.startAsyncCommand);

const RESEARCH_JOB_ID = "job-abc123";
const MUSIC_SENTINEL = "__music__";
const BLUETOOTH_SENTINEL = "__bluetooth__";
const WORKFLOW_SENTINEL = "__workflow__";
const SCHEDULE_SENTINEL = "__schedule__";

function sessionWithJob(jobId: string) {
  return {
    status: "ok" as const,
    session: {
      ...emptySnapshot(),
      active_job_id: jobId,
      messages: [
        { id: "m1", role: "user" as const, text: "研究 https://example.com/item/1" },
        {
          id: "m2",
          role: "assistant" as const,
          text: "⏳ 研究進行中…",
          jobId,
          generating: false, // sanitizeMessage strips generating
        },
      ],
    },
  };
}

// Session has active_job_id but no assistant message carrying that jobId.
function sessionWithJobNoMsg(jobId: string) {
  return {
    status: "ok" as const,
    session: {
      ...emptySnapshot(),
      active_job_id: jobId,
      messages: [
        { id: "m1", role: "user" as const, text: "研究 https://example.com/item/1" },
      ],
    },
  };
}

function emptySession() {
  return { status: "ok" as const, session: emptySnapshot() };
}

beforeEach(() => {
  mockSave.mockResolvedValue({ status: "ok" });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("App — job reconnect after reload (web#6)", () => {
  it("no reconnect when there is no active_job_id", async () => {
    mockLoad.mockResolvedValue(emptySession());
    render(<App />);
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());
    // pollJob must never be called when there is no job to reconnect.
    expect(mockPoll).not.toHaveBeenCalled();
  });

  it("no reconnect for music sentinel __music__", async () => {
    mockLoad.mockResolvedValue(sessionWithJob(MUSIC_SENTINEL));
    render(<App />);
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());
    expect(mockPoll).not.toHaveBeenCalled();
  });

  it("no reconnect for bluetooth sentinel __bluetooth__", async () => {
    mockLoad.mockResolvedValue(sessionWithJob(BLUETOOTH_SENTINEL));
    render(<App />);
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());
    expect(mockPoll).not.toHaveBeenCalled();
  });

  it("no reconnect for workflow sentinel __workflow__", async () => {
    mockLoad.mockResolvedValue(sessionWithJob(WORKFLOW_SENTINEL));
    render(<App />);
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());
    expect(mockPoll).not.toHaveBeenCalled();
  });

  it("no reconnect for schedule sentinel __schedule__", async () => {
    mockLoad.mockResolvedValue(sessionWithJob(SCHEDULE_SENTINEL));
    render(<App />);
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());
    expect(mockPoll).not.toHaveBeenCalled();
  });

  it("done job: renders final message and action buttons", async () => {
    mockLoad.mockResolvedValue(sessionWithJob(RESEARCH_JOB_ID));
    mockPoll.mockResolvedValue({
      job_status: "done",
      message: "最終研究報告",
      progress: [],
      actions: [{ label: "看市價", callback_data: "rs:tok:price" }],
    });
    render(<App />);
    await waitFor(() => screen.getByText("最終研究報告"));
    expect(screen.getByText("看市價")).toBeDefined();
  });

  it("error job: sets error status on the research message", async () => {
    mockLoad.mockResolvedValue(sessionWithJob(RESEARCH_JOB_ID));
    mockPoll.mockResolvedValue({
      job_status: "error",
      error: "研究失敗：timeout",
      message: "",
      progress: [],
      actions: [],
    });
    render(<App />);
    await waitFor(() => screen.getByText(/研究失敗：timeout/));
  });

  it("interrupted job: shows notice and keeps existing message text", async () => {
    mockLoad.mockResolvedValue(sessionWithJob(RESEARCH_JOB_ID));
    mockPoll.mockResolvedValue({
      job_status: "interrupted",
      message: "研究任務因系統重啟而中斷，請重新執行 /research。",
      progress: [],
      actions: [],
    });
    render(<App />);
    await waitFor(() => screen.getByText(/系統重啟而中斷/));
    // Original partial text should still be visible.
    expect(screen.getByText("⏳ 研究進行中…")).toBeDefined();
  });

  it("not_found job: shows error on the research message", async () => {
    mockLoad.mockResolvedValue(sessionWithJob(RESEARCH_JOB_ID));
    mockPoll.mockResolvedValue({
      job_status: "error",
      not_found: true,
      message: "找不到此任務",
      progress: [],
      actions: [],
    });
    render(<App />);
    await waitFor(() => screen.getByText(/找不到此任務/));
  });

  it("running job: resumes polling and updates message on completion", async () => {
    mockLoad.mockResolvedValue(sessionWithJob(RESEARCH_JOB_ID));
    // First call: running (resume polling), second call: done (final result).
    mockPoll
      .mockResolvedValueOnce({ job_status: "running", progress: ["step 1"], message: "", actions: [] })
      .mockResolvedValueOnce({ job_status: "done", message: "報告完成", progress: [], actions: [] });
    render(<App />);
    await waitFor(() => screen.getByText("報告完成"), { timeout: 10000 });
  });

  it("network error during reconnect does not crash — session still restored", async () => {
    mockLoad.mockResolvedValue(sessionWithJob(RESEARCH_JOB_ID));
    mockPoll.mockRejectedValue(new Error("offline"));
    render(<App />);
    await waitFor(() => screen.getByText("研究 https://example.com/item/1"));
    expect(screen.getByText("⏳ 研究進行中…")).toBeDefined();
    await waitFor(() => screen.getByText(/連線失敗/));
  });

  it("missing assistant message: shows notice without pollJob call", async () => {
    mockLoad.mockResolvedValue(sessionWithJobNoMsg(RESEARCH_JOB_ID));
    render(<App />);
    await waitFor(() => screen.getByText(/找不到可更新的訊息/));
    expect(mockPoll).not.toHaveBeenCalled();
  });

  it("new async research saves active_job_id immediately after job creation", async () => {
    mockLoad.mockResolvedValue(emptySession());
    mockStartAsync.mockResolvedValue({ status: "accepted", job_id: RESEARCH_JOB_ID });
    mockPoll.mockResolvedValue({ job_status: "running", progress: ["step 1"], message: "", actions: [] });

    render(<App />);
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());
    fireEvent.click(screen.getByText("投資研究"));
    fireEvent.change(screen.getByPlaceholderText(/商品 URL/), {
      target: { value: "https://example.com/item/1" },
    });
    fireEvent.click(screen.getByText("送出"));

    await waitFor(() =>
      expect(mockSave).toHaveBeenCalledWith(
        expect.objectContaining({ active_job_id: RESEARCH_JOB_ID }),
        expect.any(String),
      ),
    );
  });
});
