import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

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
  sendCommand: vi.fn(),
  streamCommand: vi.fn(),
  transcribeAudio: vi.fn(),
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

const stopTrack = vi.fn();

class FakeMediaRecorder {
  static isTypeSupported = () => true;
  state = "inactive";
  mimeType = "audio/webm;codecs=opus";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: (() => void) | null = null;
  onstop: (() => void) | null = null;
  start(_timeslice?: number) { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3])], { type: this.mimeType }) });
    this.onstop?.();
  }
}

beforeEach(() => {
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  vi.mocked(client.loadSession).mockResolvedValue({ status: "ok", session: emptySnapshot() });
  vi.mocked(client.transcribeAudio).mockResolvedValue({ status: "ok", transcript: "請幫我整理今天的行程" });
  vi.mocked(client.streamCommand).mockImplementation(async (_req, onEvent) => {
    onEvent({ type: "done", message: "好的" });
  });
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }) },
    configurable: true,
  });
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
});

afterEach(() => {
  Reflect.deleteProperty(window, "isSecureContext");
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("App — voice input", () => {
  it("sends the transcript through the existing chat onSend pipeline", async () => {
    render(<App />);
    await waitFor(() => expect(client.loadSession).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "開始語音輸入" }));
    fireEvent.click(await screen.findByRole("button", { name: "停止錄音" }));

    await waitFor(() => expect(client.transcribeAudio).toHaveBeenCalledTimes(1));
    expect(vi.mocked(client.transcribeAudio).mock.calls[0]).toHaveLength(1);
    expect(vi.mocked(client.transcribeAudio).mock.calls[0][0]).toBeInstanceOf(Blob);
    await waitFor(() => expect(client.streamCommand).toHaveBeenCalledTimes(1));
    expect(vi.mocked(client.streamCommand).mock.calls[0][0]).toMatchObject({
      mode: "chat",
      input: "請幫我整理今天的行程",
    });
    expect(await screen.findByText("請幫我整理今天的行程")).toBeTruthy();
  });

  it("shows a transcription error without entering the NLP pipeline", async () => {
    vi.mocked(client.transcribeAudio).mockResolvedValue({ status: "error", message: "本機語音模型未安裝" });
    render(<App />);
    await waitFor(() => expect(client.loadSession).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "開始語音輸入" }));
    fireEvent.click(await screen.findByRole("button", { name: "停止錄音" }));

    expect((await screen.findByRole("alert")).textContent).toContain("本機語音模型未安裝");
    expect(client.streamCommand).not.toHaveBeenCalled();
  });
});
