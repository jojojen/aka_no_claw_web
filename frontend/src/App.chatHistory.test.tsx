// #44: Web Chat conversation continuity. A follow-up chat turn must carry the
// prior visible turns + stable session/conversation ids so the bridge can
// resolve pronouns ("她還有哪些歌"). Other modes must NOT leak chat history.
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
  getNowPlaying: vi.fn().mockResolvedValue(null),
  getModelRoutes: vi.fn().mockResolvedValue({ status: "ok", routes: [] }),
  sendCommand: vi.fn(),
  streamCommand: vi.fn(),
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
const mockSend = vi.mocked(client.sendCommand);
const mockModelRoutes = vi.mocked(client.getModelRoutes);

function emptySession() {
  return { status: "ok" as const, session: emptySnapshot() };
}

beforeEach(() => {
  localStorage.clear();
  mockLoad.mockResolvedValue(emptySession());
  mockModelRoutes.mockResolvedValue({ status: "ok", routes: [] });
});

afterEach(() => {
  vi.clearAllMocks();
});

async function sendChat(text: string, answer: string) {
  mockStream.mockImplementationOnce(
    async (_req: WebCommandRequest, onEvent: (e: StreamEvent) => void) => {
      onEvent({ type: "done", message: answer });
    },
  );
  fireEvent.change(screen.getByPlaceholderText("輸入訊息..."), {
    target: { value: text },
  });
  fireEvent.click(screen.getByText("送出"));
  await waitFor(() => screen.getByText(answer));
}

describe("App — chat continuity (#44)", () => {
  it("a follow-up chat turn carries prior history + stable ids", async () => {
    render(<App />);
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());

    await sendChat("初音是誰", "她是虛擬歌手");
    await sendChat("她還有哪些經典歌曲", "千本櫻");

    expect(mockStream).toHaveBeenCalledTimes(2);
    const firstReq = mockStream.mock.calls[0][0] as WebCommandRequest;
    const secondReq = mockStream.mock.calls[1][0] as WebCommandRequest;

    // The first turn has no prior history.
    expect(firstReq.history).toEqual([]);

    // The follow-up turn carries the prior user + assistant turns (not the
    // current input, which goes in `input`).
    expect(secondReq.input).toBe("她還有哪些經典歌曲");
    expect(secondReq.history).toEqual([
      { role: "user", content: "初音是誰" },
      { role: "assistant", content: "她是虛擬歌手" },
    ]);
    expect(secondReq.session_id).toBeTruthy();
    expect(secondReq.session_id).toBe(firstReq.session_id);
    expect(secondReq.conversation_id).toBe("default");
  });

  it("non-chat modes do not send chat history", async () => {
    mockSend.mockResolvedValue({ status: "ok", message: "[翻譯結果]" });
    mockModelRoutes.mockResolvedValue({
      status: "ok",
      routes: [
        {
          backend: "gemini",
          label: "Gemini",
          requested_provider: "gemini",
          requested_model: "gemini-2.5-pro",
          chain: [{ provider: "gemini", model: "gemini-2.5-pro" }],
          configured: true,
        },
      ],
    });
    render(<App />);
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());
    await waitFor(() => expect(mockModelRoutes).toHaveBeenCalled());

    // Build up some chat history first.
    await sendChat("初音是誰", "她是虛擬歌手");

    // Switch to Translation mode and send.
    fireEvent.click(screen.getByRole("tab", { name: "翻譯" }));
    fireEvent.click(screen.getByText("Gemini"));
    fireEvent.change(screen.getByPlaceholderText(/翻譯成繁體中文/), {
      target: { value: "これはペンです" },
    });
    fireEvent.click(screen.getByText("送出"));

    await waitFor(() => expect(mockSend).toHaveBeenCalled());
    const req = mockSend.mock.calls[0][0] as WebCommandRequest;
    expect(req.mode).toBe("translation");
    expect(req.history).toBeUndefined();
    expect(req.session_id).toBeUndefined();
    expect(req.chat_backend).toBe("gemini");
    expect(screen.getByText(/已切換到 Gemini：gemini gemini-2.5-pro/)).toBeDefined();
  });

  it("shows concrete route info when switching model tabs", async () => {
    mockModelRoutes.mockResolvedValue({
      status: "ok",
      routes: [
        {
          backend: "gemini",
          label: "Gemini",
          requested_provider: "gemini",
          requested_model: "gemini-2.5-pro",
          chain: [
            { provider: "gemini", model: "gemini-2.5-pro" },
            { provider: "gemini", model: "gemini-2.5-flash" },
            { provider: "local", model: "qwen3:latest" },
          ],
          configured: true,
        },
      ],
    });
    render(<App />);
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());
    await waitFor(() => expect(mockModelRoutes).toHaveBeenCalled());

    fireEvent.click(screen.getByText("Gemini"));

    await waitFor(() => screen.getByText(/已切換到 Gemini：gemini gemini-2.5-pro/));
    expect(screen.queryByText(/gemini-2.5-flash/)).toBeNull();
    expect(screen.queryByText(/Fallback chain/)).toBeNull();
  });
});
