// aka_no_claw#82 PR4 — voice direct fast path. A mature low-risk prototype
// match is dispatched server-side; the `done` stream event carries
// `direct_action` and the UI renders the「不是這個」negative-feedback button,
// which reports the prototype_id and then disables itself.
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
  reportVoiceDirectRejection: vi.fn(),
  transcribeAudio: vi.fn(),
  confirmVoiceAction: vi.fn(),
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

const DIRECT_ACTION = {
  kind: "direct_action" as const,
  action: { action_id: "music.playpause", display_label: "暫停／繼續播放", risk: "low" },
  confidence: 0.94,
  margin: 0.18,
  reason_code: "prototype_high_confidence",
  prototype_id: "p-direct",
};

async function recordVoiceDirectAction() {
  render(<App />);
  await waitFor(() => expect(client.loadSession).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: "開始語音輸入" }));
  fireEvent.click(await screen.findByRole("button", { name: "停止錄音" }));
  await waitFor(() => expect(client.streamCommand).toHaveBeenCalledTimes(1));
  await screen.findByTestId("voice-direct-feedback");
}

beforeEach(() => {
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  vi.mocked(client.loadSession).mockResolvedValue({ status: "ok", session: emptySnapshot() });
  vi.mocked(client.transcribeAudio).mockResolvedValue({
    status: "ok",
    transcript: "暫停",
    utterance_id: "utt-1",
  });
  vi.mocked(client.streamCommand).mockImplementation(async (_req, onEvent) => {
    onEvent({
      type: "done",
      message: "已辨識：暫停／繼續播放\n⏯️ 已切換播放狀態",
      direct_action: DIRECT_ACTION,
    });
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

describe("App — voice direct fast path (#82 PR4)", () => {
  it("renders the「不是這個」button and reports the prototype_id on click", async () => {
    vi.mocked(client.reportVoiceDirectRejection).mockResolvedValue({
      status: "ok",
      message: "已記錄回饋，將降低此語音對應的信任度。",
    });
    await recordVoiceDirectAction();

    const btn = screen.getByRole("button", { name: "不是這個" });
    fireEvent.click(btn);
    await waitFor(() =>
      expect(client.reportVoiceDirectRejection).toHaveBeenCalledWith("p-direct"),
    );
    expect(await screen.findByText(/已記錄回饋/)).toBeTruthy();
    // The button disables after a click to prevent duplicate rejections.
    expect((screen.getByRole("button", { name: "不是這個" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "不是這個" }));
    expect(client.reportVoiceDirectRejection).toHaveBeenCalledTimes(1);
  });

  it("does not render the feedback block without direct_action", async () => {
    vi.mocked(client.streamCommand).mockImplementation(async (_req, onEvent) => {
      onEvent({ type: "done", message: "一般回答" });
    });
    render(<App />);
    await waitFor(() => expect(client.loadSession).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "開始語音輸入" }));
    fireEvent.click(await screen.findByRole("button", { name: "停止錄音" }));
    await waitFor(() => expect(client.streamCommand).toHaveBeenCalledTimes(1));
    await screen.findByText("一般回答");
    expect(screen.queryByTestId("voice-direct-feedback")).toBeNull();
  });
});
