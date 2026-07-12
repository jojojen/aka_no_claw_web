// aka_no_claw#81: the 停止 button must cancel the server-side job, not just
// drop the local stream/poll — otherwise the goal loop / research worker keeps
// burning the Mac mini for minutes after the user gave up.
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
  saveSession: vi.fn().mockResolvedValue({ status: "ok" }),
  clearSession: vi.fn(),
  pollJob: vi.fn(),
  cancelJob: vi.fn(),
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
const mockCancel = vi.mocked(client.cancelJob);

function emptySession() {
  return { status: "ok" as const, session: emptySnapshot() };
}

beforeEach(() => {
  mockLoad.mockResolvedValue(emptySession());
  mockCancel.mockResolvedValue({
    status: "ok",
    job_status: "interrupted",
    message: "已要求取消，將於下一個安全點停止。",
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("App — 停止 button cancels the backing job (#81)", () => {
  it("calls cancelJob with the stream-announced job id when stopped mid-stream", async () => {
    // A long job-backed stream that only ends when the client aborts it.
    mockStream.mockImplementationOnce(
      (_req: WebCommandRequest, onEvent: (e: StreamEvent) => void, signal: AbortSignal) => {
        onEvent({ type: "start", request_id: "r1" });
        onEvent({ type: "job", job_id: "job-goal-1" });
        onEvent({ type: "delta", text: "研究中…" });
        return new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      },
    );

    render(<App />);
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText("輸入訊息..."), {
      target: { value: "研究這張卡值不值得送鑑定" },
    });
    fireEvent.click(screen.getByText("送出"));

    const stop = await screen.findByText("停止");
    fireEvent.click(stop);

    await waitFor(() => expect(mockCancel).toHaveBeenCalledWith("job-goal-1"));
    // Abort keeps the partial text and ends the generating state.
    await screen.findByText("研究中…");
    await screen.findByText("送出");
  });

  it("calls cancelJob with the restored job id when stopping a resumed poll", async () => {
    const jobId = "job-resume-1";
    mockLoad.mockResolvedValue({
      status: "ok",
      session: {
        ...emptySnapshot(),
        messages: [
          { id: "u1", role: "user", text: "研究" },
          { id: "a1", role: "assistant", text: "⏳ 研究進行中…", jobId, generating: true },
        ],
        active_job_id: jobId,
      },
    });
    mockPoll.mockResolvedValue({ job_status: "running", progress: ["階段 1"] });

    render(<App />);
    const stop = await screen.findByText("停止", {}, { timeout: 10000 });
    fireEvent.click(stop);

    await waitFor(() => expect(mockCancel).toHaveBeenCalledWith(jobId));
  });

  it("does not call cancelJob for a plain stream with no backing job", async () => {
    mockStream.mockImplementationOnce(
      (_req: WebCommandRequest, onEvent: (e: StreamEvent) => void, signal: AbortSignal) => {
        onEvent({ type: "start", request_id: "r2" });
        onEvent({ type: "delta", text: "回答中…" });
        return new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      },
    );

    render(<App />);
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText("輸入訊息..."), {
      target: { value: "哈囉" },
    });
    fireEvent.click(screen.getByText("送出"));

    const stop = await screen.findByText("停止");
    fireEvent.click(stop);

    await screen.findByText("送出");
    expect(mockCancel).not.toHaveBeenCalled();
  });
});
