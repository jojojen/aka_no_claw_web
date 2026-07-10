// Web#8: chat-native workflow creation loop.
// Covers: NL creation via stream_redirect event, capture-mode text,
// capture-mode keeps workflowActive (Blocker 1 fix), wfe: button dispatch,
// workflow active state cleared on save/cancel.
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
  saveSession: vi.fn().mockResolvedValue({ status: "ok" }),
  clearSession: vi.fn(),
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
const mockWorkflowCommand = vi.mocked(client.runWorkflowCommand);
const mockWorkflowAction = vi.mocked(client.runWorkflowAction);
const mockStream = vi.mocked(client.streamCommand);

function emptySession() {
  return { status: "ok" as const, session: emptySnapshot() };
}

// Editor card response: has wfe: actions → workflow remains active after render.
const EDITOR_RESPONSE = {
  status: "ok" as const,
  message: "📋 Workflow 草稿\n目標：每天早上問候",
  actions: [
    { label: "新增步驟", callback_data: "wfe:add" },
    { label: "儲存", callback_data: "wfe:save" },
    { label: "取消", callback_data: "wfe:cancel" },
  ],
};

// Save response: no wfe: actions → workflow becomes inactive.
const SAVE_RESPONSE = {
  status: "ok" as const,
  message: "✅ workflow 已儲存",
  actions: [],
};

// Capture-mode response: no wfe: actions, not terminal — workflow must stay active.
const CAPTURE_RESPONSE = {
  status: "ok" as const,
  message: "請輸入 tool slug：",
  actions: [],
};

function sendText(text: string) {
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: text },
  });
  fireEvent.click(screen.getByText("送出"));
}

beforeEach(() => {
  vi.mocked(client.saveSession).mockResolvedValue({ status: "ok" });
  mockLoad.mockResolvedValue(emptySession());
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("App — workflow creation loop (web#8)", () => {
  it("routes workflow creation redirect to runWorkflowCommand with create prefix", async () => {
    mockStream.mockImplementation(async (_req, onEvent) => {
      onEvent({ type: "redirect", intent: "create_workflow", description: "每天早上問候我，然後播放最愛音樂" });
    });
    mockWorkflowCommand.mockResolvedValue(EDITOR_RESPONSE);
    render(<App />);
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());

    sendText("幫我做一個每天早上問候我，然後播放最愛音樂的工作流");

    await waitFor(() => screen.getByText(/Workflow 草稿/));
    expect(mockStream).toHaveBeenCalled();
    expect(mockWorkflowCommand).toHaveBeenCalledWith(
      "create 每天早上問候我，然後播放最愛音樂",
      "cloud_pool",
    );
  });

  it("routes English workflow redirect to runWorkflowCommand", async () => {
    mockStream.mockImplementation(async (_req, onEvent) => {
      onEvent({ type: "redirect", intent: "create_workflow", description: "create a workflow that checks weather daily" });
    });
    mockWorkflowCommand.mockResolvedValue(EDITOR_RESPONSE);
    render(<App />);
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());

    sendText("create a workflow that checks weather daily");

    await waitFor(() => expect(mockWorkflowCommand).toHaveBeenCalled());
    expect(mockWorkflowCommand).toHaveBeenCalledWith(
      "create create a workflow that checks weather daily",
      "cloud_pool",
    );
  });

  it("does not intercept normal chat text", async () => {
    mockStream.mockImplementation(async (_req, onEvent) => {
      onEvent({ type: "done", message: "你好！" });
    });
    render(<App />);
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());

    sendText("你好");

    await waitFor(() => screen.getByText("你好！"));
    expect(mockWorkflowCommand).not.toHaveBeenCalled();
  });

  it("routes capture text to runWorkflowCommand while workflow card is open", async () => {
    mockStream.mockImplementation(async (_req, onEvent) => {
      onEvent({ type: "redirect", intent: "create_workflow", description: "每天早上問候我" });
    });
    mockWorkflowCommand
      .mockResolvedValueOnce(EDITOR_RESPONSE)
      .mockResolvedValueOnce({
        status: "ok" as const,
        message: "請輸入 tool slug：",
        actions: [],
      });

    render(<App />);
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());

    sendText("幫我建一個每天早上問候我的工作流");
    await waitFor(() => screen.getByText(/Workflow 草稿/));

    // Workflow is now active; next message must go to the workflow endpoint.
    sendText("weather_today");

    await waitFor(() =>
      expect(mockWorkflowCommand).toHaveBeenNthCalledWith(2, "weather_today", "cloud_pool"),
    );
  });

  it("capture-mode response (no wfe: actions) keeps workflowActive so next text still routes to workflow", async () => {
    mockStream.mockImplementation(async (_req, onEvent) => {
      onEvent({ type: "redirect", intent: "create_workflow", description: "每天早上問候我" });
    });
    // Use permanent mock (not once) so no unconsumed values leak to later tests.
    mockWorkflowCommand.mockResolvedValue(EDITOR_RESPONSE);
    // "新增步驟" (wfe:add) button goes through runWorkflowAction, not runWorkflowCommand.
    mockWorkflowAction.mockResolvedValue(CAPTURE_RESPONSE);

    render(<App />);
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());

    sendText("建立 workflow");
    await waitFor(() => screen.getByText(/Workflow 草稿/));

    // Trigger a non-terminal button (wfe:add) that returns a capture prompt with no wfe: actions.
    fireEvent.click(screen.getByText("新增步驟"));
    await waitFor(() => screen.getByText("請輸入 tool slug："));

    // workflowActive must still be true (mayClose=false, no wfe:, no error)
    // → next text goes to workflow endpoint.
    sendText("weather_today");
    await waitFor(() =>
      expect(mockWorkflowCommand).toHaveBeenNthCalledWith(2, "weather_today", "cloud_pool"),
    );
  });

  it("routes wfe: action button to runWorkflowAction and updates card in place", async () => {
    mockStream.mockImplementation(async (_req, onEvent) => {
      onEvent({ type: "redirect", intent: "create_workflow", description: "每天早上問候我" });
    });
    mockWorkflowCommand.mockResolvedValue(EDITOR_RESPONSE);
    mockWorkflowAction.mockResolvedValue(SAVE_RESPONSE);

    render(<App />);
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());

    sendText("建立 workflow：每天早上問候我");
    await waitFor(() => screen.getByText("儲存"));

    fireEvent.click(screen.getByText("儲存"));

    await waitFor(() =>
      expect(mockWorkflowAction).toHaveBeenCalledWith("wfe:save"),
    );
    await waitFor(() => screen.getByText("✅ workflow 已儲存"));
  });

  it("clears workflow active state after save so next chat text goes to stream", async () => {
    mockStream
      .mockImplementationOnce(async (_req, onEvent) => {
        onEvent({ type: "redirect", intent: "create_workflow", description: "每天早上問候我" });
      })
      .mockImplementationOnce(async (_req, onEvent) => {
        onEvent({ type: "done", message: "聊天回覆" });
      });
    mockWorkflowCommand.mockResolvedValue(EDITOR_RESPONSE);
    mockWorkflowAction.mockResolvedValue(SAVE_RESPONSE);

    render(<App />);
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());

    sendText("建立 workflow：每天早上問候我");
    await waitFor(() => screen.getByText("儲存"));

    fireEvent.click(screen.getByText("儲存"));
    await waitFor(() => screen.getByText("✅ workflow 已儲存"));

    // After save the card has no wfe: actions + mayClose=true → workflowActive resets.
    // Subsequent text must go to the chat stream, not the workflow endpoint.
    sendText("繼續聊天");
    await waitFor(() => screen.getByText("聊天回覆"));
    expect(mockStream).toHaveBeenCalledTimes(2);
  });
});
