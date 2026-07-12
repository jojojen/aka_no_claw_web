// aka_no_claw#82 PR1 — voice clarification card. A short voice utterance the
// backend suspects is a misrecognized control command comes back as a `done`
// stream event carrying `clarification`; the UI renders candidate buttons plus
// the「都不是」fallback, dispatches a candidate via action_id only, and resends
// the transcript with clarification_declined on fallback.
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

const CLARIFICATION = {
  kind: "clarify" as const,
  transcript: "關鍵善",
  reason_code: "first_use_control_suspicion",
  candidates: [
    { action_id: "ir.fan.power", display_label: "fan／power", risk: "low", score: 0 },
    { action_id: "music.playpause", display_label: "暫停／繼續播放", risk: "low", score: 0 },
  ],
  fallback: { label: "都不是，當一般問題處理" },
};

async function recordVoiceClarification() {
  render(<App />);
  await waitFor(() => expect(client.loadSession).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: "開始語音輸入" }));
  fireEvent.click(await screen.findByRole("button", { name: "停止錄音" }));
  await waitFor(() => expect(client.streamCommand).toHaveBeenCalledTimes(1));
  await screen.findByTestId("voice-clarification");
}

beforeEach(() => {
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  vi.mocked(client.loadSession).mockResolvedValue({ status: "ok", session: emptySnapshot() });
  vi.mocked(client.transcribeAudio).mockResolvedValue({
    status: "ok",
    transcript: "關鍵善",
    utterance_id: "utt-1",
  });
  vi.mocked(client.streamCommand).mockImplementation(async (_req, onEvent) => {
    onEvent({
      type: "done",
      message: "我聽到：「關鍵善」\n你是要執行哪一個？",
      clarification: CLARIFICATION,
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

describe("App — voice clarification (#82 PR1)", () => {
  it("renders candidate buttons and dispatches the chosen action by id only", async () => {
    vi.mocked(client.confirmVoiceAction).mockResolvedValue({
      status: "ok",
      message: "已送出 fan power",
    });
    await recordVoiceClarification();

    fireEvent.click(screen.getByRole("button", { name: "fan／power" }));
    await waitFor(() =>
      expect(client.confirmVoiceAction).toHaveBeenCalledWith("ir.fan.power"),
    );
    expect(await screen.findByText("已送出 fan power")).toBeTruthy();
    // Buttons disable after the selection to prevent double submits.
    expect(
      (screen.getByRole("button", { name: "暫停／繼續播放" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("resends the transcript with clarification_declined on fallback", async () => {
    await recordVoiceClarification();

    fireEvent.click(screen.getByRole("button", { name: "都不是，當一般問題處理" }));
    await waitFor(() => expect(client.streamCommand).toHaveBeenCalledTimes(2));
    expect(vi.mocked(client.streamCommand).mock.calls[1][0]).toMatchObject({
      mode: "chat",
      input: "關鍵善",
      input_source: "voice",
      voice: { utterance_id: "utt-1", clarification_declined: true },
    });
    expect(client.confirmVoiceAction).not.toHaveBeenCalled();
  });
});
