// Process event disclosure block (aka_no_claw_web#WP-5a): a "process" stream
// event must accumulate into processText, render as a collapsed disclosure
// above the answer, survive the "done" event, persist through session
// round-trip, and never appear in the history payload sent to the bridge.
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
  sendCommand: vi.fn(),
  streamCommand: vi.fn(),
  reportVoiceDirectRejection: vi.fn(),
  startAsyncCommand: vi.fn(),
  pollJob: vi.fn(),
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
  getNowPlaying: vi.fn().mockResolvedValue(null),
  getModelRoutes: vi.fn().mockResolvedValue({ status: "ok", routes: [] }),
  getChatSettings: vi.fn().mockResolvedValue({ status: "ok", settings: null }),
  saveChatSettings: vi.fn(),
  restartAll: vi.fn(),
}));

import App from "./App";
import * as client from "./api/commandClient";
import { emptySnapshot } from "./session";

const mockLoad = vi.mocked(client.loadSession);
const mockStream = vi.mocked(client.streamCommand);
const mockSave = vi.mocked(client.saveSession);

beforeEach(() => {
  localStorage.clear();
  mockLoad.mockResolvedValue({ status: "ok", session: emptySnapshot() });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("App — process event disclosure (#WP-5a)", () => {
  it("process events accumulate and render a collapsed disclosure header", async () => {
    mockStream.mockImplementationOnce(
      async (_req: WebCommandRequest, onEvent: (e: StreamEvent) => void) => {
        onEvent({ type: "process", text: "🔍 圖片觀察：收據合計 3,000 円" });
        onEvent({ type: "done", message: "合計為 3,000 円。" });
      },
    );

    render(<App />);
    await waitFor(() => screen.getByPlaceholderText("輸入訊息..."));

    fireEvent.change(screen.getByPlaceholderText("輸入訊息..."), {
      target: { value: "加總金額" },
    });
    fireEvent.click(screen.getByText("送出"));

    await waitFor(() => screen.getByText("合計為 3,000 円。"));

    expect(screen.getByText("🔍 分析過程")).toBeDefined();
    expect(screen.queryByText(/收據合計/)).toBeNull();
  });

  it("tapping the disclosure header expands and shows the process text", async () => {
    mockStream.mockImplementationOnce(
      async (_req: WebCommandRequest, onEvent: (e: StreamEvent) => void) => {
        onEvent({ type: "process", text: "🔍 圖片觀察：一張購物收據" });
        onEvent({ type: "done", message: "收到。" });
      },
    );

    render(<App />);
    await waitFor(() => screen.getByPlaceholderText("輸入訊息..."));

    fireEvent.change(screen.getByPlaceholderText("輸入訊息..."), {
      target: { value: "看圖" },
    });
    fireEvent.click(screen.getByText("送出"));

    await waitFor(() => screen.getByText("收到。"));
    fireEvent.click(screen.getByText("🔍 分析過程"));

    await waitFor(() => screen.getByText(/一張購物收據/));
  });

  it("done event does not clear the process disclosure block", async () => {
    mockStream.mockImplementationOnce(
      async (_req: WebCommandRequest, onEvent: (e: StreamEvent) => void) => {
        onEvent({ type: "process", text: "🔍 圖片觀察：偵測到文字" });
        onEvent({ type: "delta", text: "部分" });
        onEvent({ type: "done", message: "最終答案。" });
      },
    );

    render(<App />);
    await waitFor(() => screen.getByPlaceholderText("輸入訊息..."));

    fireEvent.change(screen.getByPlaceholderText("輸入訊息..."), {
      target: { value: "問題" },
    });
    fireEvent.click(screen.getByText("送出"));

    await waitFor(() => screen.getByText("最終答案。"));

    expect(screen.getByText("🔍 分析過程")).toBeDefined();
    expect(screen.queryByText(/偵測到文字/)).toBeNull();
  });

  it("messages without process events render exactly as before", async () => {
    mockStream.mockImplementationOnce(
      async (_req: WebCommandRequest, onEvent: (e: StreamEvent) => void) => {
        onEvent({ type: "done", message: "普通回答。" });
      },
    );

    render(<App />);
    await waitFor(() => screen.getByPlaceholderText("輸入訊息..."));

    fireEvent.change(screen.getByPlaceholderText("輸入訊息..."), {
      target: { value: "你好" },
    });
    fireEvent.click(screen.getByText("送出"));

    await waitFor(() => screen.getByText("普通回答。"));

    expect(screen.queryByText("🔍 分析過程")).toBeNull();
  });

  it("history payload excludes processText from prior turns", async () => {
    // First turn: has processText
    mockStream.mockImplementationOnce(
      async (_req: WebCommandRequest, onEvent: (e: StreamEvent) => void) => {
        onEvent({ type: "process", text: "🔍 圖片觀察：收據" });
        onEvent({ type: "done", message: "金額是 500 円。" });
      },
    );
    // Second turn: captures the history payload
    mockStream.mockImplementationOnce(
      async (_req: WebCommandRequest, onEvent: (e: StreamEvent) => void) => {
        onEvent({ type: "done", message: "好的。" });
      },
    );

    render(<App />);
    await waitFor(() => screen.getByPlaceholderText("輸入訊息..."));

    fireEvent.change(screen.getByPlaceholderText("輸入訊息..."), {
      target: { value: "算總額" },
    });
    fireEvent.click(screen.getByText("送出"));
    await waitFor(() => screen.getByText("金額是 500 円。"));

    fireEvent.change(screen.getByPlaceholderText("輸入訊息..."), {
      target: { value: "再問一次" },
    });
    fireEvent.click(screen.getByText("送出"));
    await waitFor(() => screen.getByText("好的。"));

    expect(mockStream).toHaveBeenCalledTimes(2);
    const secondReq = mockStream.mock.calls[1][0] as WebCommandRequest;
    const historyContents = (secondReq.history ?? []).map((h) => h.content);
    expect(historyContents.every((c) => !c.includes("圖片觀察"))).toBe(true);
  });

  it("processText persists through session snapshot round-trip", async () => {
    const { fromSnapshot, toSnapshot } = await import("./session");
    const msg = {
      id: "m1",
      role: "assistant" as const,
      text: "答案",
      processText: "🔍 圖片觀察：收據",
    };
    const snap = toSnapshot({
      messages: [msg],
      mode: "chat",
      chatBackend: "local",
      investmentSubmode: "deep_product_research",
    });
    const restored = fromSnapshot(snap);
    expect(restored.messages[0].processText).toBe("🔍 圖片觀察：收據");
  });

  it("saveSession snapshot includes processText", async () => {
    mockStream.mockImplementationOnce(
      async (_req: WebCommandRequest, onEvent: (e: StreamEvent) => void) => {
        onEvent({ type: "process", text: "🔍 圖片觀察：票券" });
        onEvent({ type: "done", message: "面額 1,000 円。" });
      },
    );

    render(<App />);
    await waitFor(() => screen.getByPlaceholderText("輸入訊息..."));

    fireEvent.change(screen.getByPlaceholderText("輸入訊息..."), {
      target: { value: "看票" },
    });
    fireEvent.click(screen.getByText("送出"));
    await waitFor(() => screen.getByText("面額 1,000 円。"));

    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    const savedSnap = mockSave.mock.calls[mockSave.mock.calls.length - 1][0];
    const assistantMsg = savedSnap.messages.find(
      (m: { role: string }) => m.role === "assistant",
    ) as { processText?: string } | undefined;
    expect(assistantMsg?.processText).toBe("🔍 圖片觀察：票券");
  });
});
