// aka_no_claw#81 PR3: a long chat/research stream is backed by a recovery job.
// When the NDJSON stream drops mid-run (e.g. a mobile screen-lock kills the
// held connection), the client must NOT surface a transport error — it should
// poll the job id announced in the `job` event and recover the final answer.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { StreamEvent, WebCommandRequest } from "./types/command";

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
const mockStream = vi.mocked(client.streamCommand);
const mockPoll = vi.mocked(client.pollJob);
const mockSave = vi.mocked(client.saveSession);

const STREAM_JOB_ID = "job-stream-1";

function emptySession() {
  return { status: "ok" as const, session: emptySnapshot() };
}

beforeEach(() => {
  mockLoad.mockResolvedValue(emptySession());
  mockSave.mockResolvedValue({ status: "ok" });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("App — chat stream drop recovers via job poll (#81 PR3)", () => {
  it("emits job, drops mid-stream, then polls the job for the final answer", async () => {
    // Stream announces its recovery job, streams a partial, then the connection
    // dies (screen-lock) — modelled as the streamCommand promise rejecting.
    mockStream.mockImplementationOnce(
      async (_req: WebCommandRequest, onEvent: (e: StreamEvent) => void) => {
        onEvent({ type: "start", request_id: "r1" });
        onEvent({ type: "job", job_id: STREAM_JOB_ID });
        onEvent({ type: "delta", text: "分析中…" });
        throw new Error("network dropped");
      },
    );
    mockPoll.mockResolvedValue({
      job_status: "done",
      message: "建議購買並送鑑定。",
      progress: [],
      actions: [],
    });

    render(<App />);
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText("輸入訊息..."), {
      target: { value: "這張值得買來送鑑定嗎？" },
    });
    fireEvent.click(screen.getByText("送出"));

    // The dropped stream must hand off to job polling and surface the answer,
    // not a "無法連線" transport error.
    await waitFor(() => screen.getByText("建議購買並送鑑定。"), { timeout: 10000 });
    expect(mockPoll).toHaveBeenCalledWith(STREAM_JOB_ID);
  });

  it("stamps the assistant message with the job id so a reload can reconnect", async () => {
    mockStream.mockImplementationOnce(
      async (_req: WebCommandRequest, onEvent: (e: StreamEvent) => void) => {
        onEvent({ type: "start", request_id: "r2" });
        onEvent({ type: "job", job_id: STREAM_JOB_ID });
        onEvent({ type: "done", message: "完成的答案" });
      },
    );

    render(<App />);
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText("輸入訊息..."), {
      target: { value: "幫我研究這張卡" },
    });
    fireEvent.click(screen.getByText("送出"));

    await waitFor(() => screen.getByText("完成的答案"));
    // active_job_id is derived from the streamed message's jobId, so a reload
    // can poll-reconnect to the same run.
    await waitFor(() =>
      expect(mockSave).toHaveBeenCalledWith(
        expect.objectContaining({ active_job_id: STREAM_JOB_ID }),
        expect.any(String),
      ),
    );
  });
});
