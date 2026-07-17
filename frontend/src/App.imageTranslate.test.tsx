// Image translation upload (aka_no_claw#43): selecting a local image in
// Translation Mode must send the real bytes (base64) to the bridge and render
// the returned Traditional Chinese translation in the shared stream.
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
const mockSend = vi.mocked(client.sendCommand);

beforeEach(() => {
  mockLoad.mockResolvedValue({ status: "ok", session: emptySnapshot() });
});

afterEach(() => {
  vi.clearAllMocks();
});

function fileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement | null;
  if (!input) throw new Error("file input not found");
  return input;
}

describe("App — image translation upload (#43)", () => {
  it("sends real image bytes (data_base64) and renders the translation", async () => {
    mockSend.mockResolvedValue({
      status: "ok",
      message: "🌐→🇹🇼 圖片文字翻譯（偵測語言：日語）\n\n這是一支筆。",
      mode: "translation",
      submode: "image_translation",
    });

    render(<App />);
    await waitFor(() => screen.getByLabelText("模式選擇"));

    // Switch to Translation mode so the picker becomes active.
    fireEvent.click(screen.getByRole("tab", { name: "翻譯" }));

    // bytes [1,2,3,4] → base64 "AQIDBA=="
    const file = new File([new Uint8Array([1, 2, 3, 4])], "card.png", { type: "image/png" });
    fireEvent.change(fileInput(), { target: { files: [file] } });

    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    const req = mockSend.mock.calls[0][0];
    expect(req.submode).toBe("image_translation");
    expect(req.attachments?.[0]).toMatchObject({
      type: "image",
      filename: "card.png",
      content_type: "image/png",
      data_base64: "AQIDBA==",
    });

    await waitFor(() => screen.getByText(/這是一支筆/));
  });

  it("shows a read error and never calls the bridge when the file can't be read", async () => {
    // Force FileReader to fail.
    const orig = globalThis.FileReader;
    class FailingReader {
      onerror: ((e: unknown) => void) | null = null;
      onload: ((e: unknown) => void) | null = null;
      error = new Error("boom");
      readAsDataURL() {
        queueMicrotask(() => this.onerror?.({}));
      }
    }
    // @ts-expect-error test stub
    globalThis.FileReader = FailingReader;
    try {
      render(<App />);
      await waitFor(() => screen.getByLabelText("模式選擇"));
      fireEvent.click(screen.getByRole("tab", { name: "翻譯" }));
      const file = new File([new Uint8Array([9])], "bad.png", { type: "image/png" });
      fireEvent.change(fileInput(), { target: { files: [file] } });
      await waitFor(() => screen.getByText(/讀取圖片失敗/));
      expect(mockSend).not.toHaveBeenCalled();
    } finally {
      globalThis.FileReader = orig;
    }
  });
});
