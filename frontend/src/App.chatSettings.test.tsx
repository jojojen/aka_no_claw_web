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
  getChatSettings: vi.fn(),
  saveChatSettings: vi.fn(),
  getModelRoutes: vi.fn().mockResolvedValue({ status: "ok", routes: [] }),
  getNowPlaying: vi.fn().mockResolvedValue(null),
  sendCommand: vi.fn(),
  streamCommand: vi.fn(),
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
  restartAll: vi.fn(),
}));

import App from "./App";
import * as client from "./api/commandClient";
import { emptySnapshot } from "./session";
import type { ChatSettings } from "./types/command";

const mockLoad = vi.mocked(client.loadSession);
const mockGetChatSettings = vi.mocked(client.getChatSettings);
const mockSaveChatSettings = vi.mocked(client.saveChatSettings);

const SETTINGS: ChatSettings = {
  default_chat_provider: "cloud_pool" as const,
  cloud_pool: ["gemini", "mistral", "big_pickle"],
  default_provider_options: [
    { value: "cloud_pool" as const, label: "雲端池" },
    { value: "gemini" as const, label: "Gemini" },
    { value: "cloud_mistral" as const, label: "Mistral" },
    { value: "cloud_pickle" as const, label: "OpenCode" },
    { value: "local" as const, label: "本地" },
  ],
  providers: {
    gemini: { label: "Gemini", enabled: true, model: "gemini-3.5-flash", configured: true },
    mistral: { label: "Mistral", enabled: true, model: "mistral-large-latest", configured: false },
    big_pickle: { label: "OpenCode", enabled: true, model: "big-pickle", configured: true },
    local: { label: "本地", enabled: true, model: "qwen3:4b", configured: true },
  },
  model_options: {
    gemini: ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-pro", "gemini-2.5-flash"],
    mistral: ["mistral-small-latest", "mistral-medium-latest", "mistral-large-latest"],
    big_pickle: ["big-pickle", "deepseek-v4-flash-free", "mimo-v2.5-free"],
    local: ["qwen3:4b", "qwen3:14b"],
  },
};

beforeEach(() => {
  mockLoad.mockResolvedValue({ status: "ok", session: emptySnapshot() });
  mockGetChatSettings.mockResolvedValue({ status: "ok", settings: SETTINGS });
  mockSaveChatSettings.mockResolvedValue({ status: "ok", settings: SETTINGS });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("App — chat settings", () => {
  it("opens the settings modal from the header gear", async () => {
    render(<App />);

    await waitFor(() => screen.getByLabelText("聊天模型設定"));
    fireEvent.click(screen.getByLabelText("聊天模型設定"));

    await waitFor(() => screen.getByText("聊天模型設定"));
    expect(screen.getByText("雲端池順序")).toBeDefined();
    expect(screen.getByRole("heading", { name: "Gemini" })).toBeDefined();
  });

  it("shows local reload success after saving a new local model", async () => {
    mockSaveChatSettings.mockResolvedValueOnce({
      status: "ok",
      settings: {
        ...SETTINGS,
        providers: {
          ...SETTINGS.providers,
          local: { ...SETTINGS.providers.local, model: "qwen3:14b" },
        },
      },
      local_reload: {
        status: "ok",
        model: "qwen3:14b",
        message: "本地模型已載入：qwen3:14b",
      },
    });

    render(<App />);
    await waitFor(() => screen.getByLabelText("聊天模型設定"));
    fireEvent.click(screen.getByLabelText("聊天模型設定"));
    await waitFor(() => screen.getByText("聊天模型設定"));

    fireEvent.click(screen.getByLabelText("qwen3:14b"));
    fireEvent.click(screen.getByText("儲存"));

    await waitFor(() => expect(mockSaveChatSettings).toHaveBeenCalledTimes(1));
    expect(mockSaveChatSettings.mock.calls[0][0].providers.local.model).toBe("qwen3:14b");
    await waitFor(() => screen.getByText("本地模型已載入：qwen3:14b"));
  });

  it("shows local reload failure while keeping the settings save result visible", async () => {
    mockSaveChatSettings.mockResolvedValueOnce({
      status: "partial",
      settings: SETTINGS,
      local_reload: {
        status: "error",
        model: "qwen3:14b",
        previous_model: "qwen3:4b",
        message: "本地模型載入失敗：model not found",
      },
      message: "雲端設定已儲存，但本地模型載入失敗",
    });

    render(<App />);
    await waitFor(() => screen.getByLabelText("聊天模型設定"));
    fireEvent.click(screen.getByLabelText("聊天模型設定"));
    await waitFor(() => screen.getByText("聊天模型設定"));

    fireEvent.click(screen.getByLabelText("qwen3:14b"));
    fireEvent.click(screen.getByText("儲存"));

    await waitFor(() => screen.getByText("本地模型載入失敗：model not found"));
  });
});
