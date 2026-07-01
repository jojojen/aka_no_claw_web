// Web#9: schedule creation loop.
// Covers: create_schedule redirect (with/without workflow_id), capture-mode text
// routing, sh: action dispatch, mayClose clears scheduleActive.
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
const mockStream = vi.mocked(client.streamCommand);
const mockScheduleCommand = vi.mocked(client.runScheduleHomeCommand);
const mockScheduleAction = vi.mocked(client.runScheduleHomeAction);
const mockWorkflowCommand = vi.mocked(client.runWorkflowCommand);
const mockMusicCommand = vi.mocked(client.runMusicCommand);

function emptySession() {
  return { status: "ok" as const, session: emptySnapshot() };
}

// Time picker card — has sh: actions.
const TIME_PICKER = {
  status: "ok" as const,
  message: "🕐 設定時間：07:00",
  actions: [
    { label: "➖ 時", callback_data: "sh:t:07:00:h-" },
    { label: "✅ 下一步", callback_data: "sh:t:07:00:ok" },
    { label: "✖️ 取消", callback_data: "sh:cancel" },
  ],
};

// Capture hint — no sh: actions.
const CAPTURE_HINT = {
  status: "ok" as const,
  message: "排程設定中，請傳入斜線指令",
  actions: [{ label: "完成", callback_data: "sh:done" }],
};

// Done response — no sh: actions, returned by sh:done.
const DONE_RESPONSE = {
  status: "ok" as const,
  message: "✅ 排程設定完成，已加入 1 個指令。",
  actions: [],
};

// Cancel response — returned by sh:cancel.
const CANCEL_RESPONSE = {
  status: "ok" as const,
  message: "已取消",
  actions: [],
};

function sendText(text: string) {
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: text },
  });
  fireEvent.click(screen.getByText("送出"));
}

beforeEach(() => {
  vi.mocked(client.saveSession).mockReset();
  vi.mocked(client.saveSession).mockResolvedValue({ status: "ok" });
  mockLoad.mockReset();
  mockLoad.mockResolvedValue(emptySession());
  mockStream.mockReset();
  mockScheduleCommand.mockReset();
  mockScheduleAction.mockReset();
  mockWorkflowCommand.mockReset();
  mockMusicCommand.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("App — schedule creation loop (web#9)", () => {
  it("routes create_schedule redirect (no workflow_id) to runScheduleHomeCommand('add')", async () => {
    mockStream.mockImplementation(async (_req, onEvent) => {
      onEvent({ type: "redirect", intent: "create_schedule", description: "幫我建立排程" });
    });
    mockScheduleCommand.mockResolvedValue(TIME_PICKER);

    render(<App />);
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());

    sendText("幫我建立排程");

    await waitFor(() => screen.getByText(/設定時間/));
    expect(mockScheduleCommand).toHaveBeenCalledWith("add");
  });

  it("routes create_schedule redirect with workflow_id to runScheduleHomeCommand('add_for_wf <id>')", async () => {
    mockStream.mockImplementation(async (_req, onEvent) => {
      onEvent({
        type: "redirect",
        intent: "create_schedule",
        description: "幫我排程執行 greeting_workflow",
        workflow_id: "greeting_workflow",
      });
    });
    mockScheduleCommand.mockResolvedValue(TIME_PICKER);

    render(<App />);
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());

    sendText("幫我排程執行 greeting_workflow");

    await waitFor(() => expect(mockScheduleCommand).toHaveBeenCalled());
    expect(mockScheduleCommand).toHaveBeenCalledWith("add_for_wf greeting_workflow");
  });

  it("routes sh: button to runScheduleHomeAction", async () => {
    mockStream.mockImplementation(async (_req, onEvent) => {
      onEvent({ type: "redirect", intent: "create_schedule", description: "新增排程" });
    });
    mockScheduleCommand.mockResolvedValue(TIME_PICKER);
    mockScheduleAction.mockResolvedValue(CAPTURE_HINT);

    render(<App />);
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());

    sendText("新增排程");
    await waitFor(() => screen.getByText("✅ 下一步"));

    fireEvent.click(screen.getByText("✅ 下一步"));

    await waitFor(() => expect(mockScheduleAction).toHaveBeenCalledWith("sh:t:07:00:ok"));
    await waitFor(() => screen.getByText(/排程設定中/));
  });

  it("capture-mode text routes to runScheduleHomeCommand while scheduleActive", async () => {
    mockStream.mockImplementation(async (_req, onEvent) => {
      onEvent({ type: "redirect", intent: "create_schedule", description: "新增排程" });
    });
    mockScheduleCommand
      .mockResolvedValueOnce(TIME_PICKER)
      .mockResolvedValueOnce(CAPTURE_HINT);  // after "完成"-like detection
    mockScheduleAction.mockResolvedValue(CAPTURE_HINT);

    render(<App />);
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());

    sendText("新增排程");
    await waitFor(() => screen.getByText("✅ 下一步"));

    // Trigger picker → capture mode.
    fireEvent.click(screen.getByText("✅ 下一步"));
    await waitFor(() => screen.getByText(/排程設定中/));

    // scheduleActive=true: next text routes to schedule endpoint.
    sendText("/workflow run greeting_workflow");
    await waitFor(() =>
      expect(mockScheduleCommand).toHaveBeenCalledWith("/workflow run greeting_workflow"),
    );
  });

  it("sh:cancel clears scheduleActive so next text goes to stream", async () => {
    mockStream
      .mockImplementationOnce(async (_req, onEvent) => {
        onEvent({ type: "redirect", intent: "create_schedule", description: "新增排程" });
      })
      .mockImplementationOnce(async (_req, onEvent) => {
        onEvent({ type: "done", message: "聊天回覆" });
      });
    mockScheduleCommand.mockResolvedValue(TIME_PICKER);
    mockScheduleAction.mockResolvedValue(CANCEL_RESPONSE);

    render(<App />);
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());

    sendText("新增排程");
    await waitFor(() => screen.getByText("✖️ 取消"));

    fireEvent.click(screen.getByText("✖️ 取消"));
    await waitFor(() => screen.getByText("已取消"));

    // scheduleActive cleared — next text should go to chat stream.
    sendText("繼續聊天");
    await waitFor(() => screen.getByText("聊天回覆"));
    expect(mockStream).toHaveBeenCalledTimes(2);
  });

  it("sh:done clears scheduleActive", async () => {
    mockStream.mockImplementation(async (_req, onEvent) => {
      onEvent({ type: "redirect", intent: "create_schedule", description: "新增排程" });
    });
    mockScheduleCommand.mockResolvedValue(TIME_PICKER);
    mockScheduleAction
      .mockResolvedValueOnce(CAPTURE_HINT)
      .mockResolvedValueOnce(DONE_RESPONSE);

    render(<App />);
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());

    sendText("新增排程");
    await waitFor(() => screen.getByText("✅ 下一步"));

    fireEvent.click(screen.getByText("✅ 下一步"));
    await waitFor(() => screen.getByText("完成"));

    fireEvent.click(screen.getByText("完成"));
    await waitFor(() => screen.getByText(/已加入/));
    // scheduleActive=false: schedule surface closed.
    expect(mockScheduleAction).toHaveBeenCalledWith("sh:done");
  });
});

// Life panel discoverability — web#9 items 1 & 2
describe("App — LifeActionPanel schedule/workflow list entry points (web#9)", () => {
  async function renderLifeMode() {
    render(<App />);
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());
    // Switch to 生活 mode by clicking its mode button.
    fireEvent.click(screen.getByText("生活"));
  }

  it("📅 排程列表 button calls runScheduleHomeCommand('')", async () => {
    mockScheduleCommand.mockResolvedValue({
      status: "ok",
      message: "排程列表（空）",
      actions: [],
    });
    await renderLifeMode();

    fireEvent.click(screen.getByText("📅 排程"));
    fireEvent.click(screen.getByText("📅 排程列表"));

    await waitFor(() => expect(mockScheduleCommand).toHaveBeenCalledWith(""));
    await waitFor(() => screen.getByText("排程列表（空）"));
  });

  it("📋 工作流列表 button calls runWorkflowCommand('list')", async () => {
    mockWorkflowCommand.mockResolvedValue({
      status: "ok",
      message: "📋 Workflows",
      actions: [
        { label: "▶️ 執行 wf-greet", callback_data: "wf:run:wf-greet" },
        { label: "📅 排程執行 wf-greet", callback_data: "wf:schedule:wf-greet" },
        { label: "🗑 刪除 wf-greet", callback_data: "wf:delete:wf-greet" },
      ],
    });
    await renderLifeMode();

    fireEvent.click(screen.getByText("🔄 工作流"));
    fireEvent.click(screen.getByText("📋 工作流列表"));

    await waitFor(() => expect(mockWorkflowCommand).toHaveBeenCalledWith("list"));
    await waitFor(() => screen.getByText("▶️ 執行 wf-greet"));
    await waitFor(() => screen.getByText("📅 排程執行 wf-greet"));
    await waitFor(() => screen.getByText("🗑 刪除 wf-greet"));
  });

  it("▶️ 執行 button calls runWorkflowCommand('run <id>')", async () => {
    mockWorkflowCommand.mockResolvedValue({
      status: "ok",
      message: "📋 Workflows",
      actions: [
        { label: "▶️ 執行 wf-greet", callback_data: "wf:run:wf-greet" },
        { label: "📅 排程執行 wf-greet", callback_data: "wf:schedule:wf-greet" },
        { label: "🗑 刪除 wf-greet", callback_data: "wf:delete:wf-greet" },
      ],
    });
    mockWorkflowCommand.mockResolvedValueOnce({
      status: "ok",
      message: "📋 Workflows",
      actions: [
        { label: "▶️ 執行 wf-greet", callback_data: "wf:run:wf-greet" },
        { label: "📅 排程執行 wf-greet", callback_data: "wf:schedule:wf-greet" },
        { label: "🗑 刪除 wf-greet", callback_data: "wf:delete:wf-greet" },
      ],
    });
    mockWorkflowCommand.mockResolvedValueOnce({
      status: "ok",
      message: "workflow executed",
      actions: [],
    });
    await renderLifeMode();

    fireEvent.click(screen.getByText("🔄 工作流"));
    fireEvent.click(screen.getByText("📋 工作流列表"));
    await waitFor(() => screen.getByText("▶️ 執行 wf-greet"));

    fireEvent.click(screen.getByText("▶️ 執行 wf-greet"));

    await waitFor(() => expect(mockWorkflowCommand).toHaveBeenCalledWith("run wf-greet"));
    await waitFor(() => screen.getByText("workflow executed"));
  });

  it("📅 排程執行 button calls runScheduleHomeCommand('add_for_wf <id>')", async () => {
    mockWorkflowCommand.mockResolvedValue({
      status: "ok",
      message: "📋 Workflows",
      actions: [
        { label: "▶️ 執行 wf-greet", callback_data: "wf:run:wf-greet" },
        { label: "📅 排程執行 wf-greet", callback_data: "wf:schedule:wf-greet" },
        { label: "🗑 刪除 wf-greet", callback_data: "wf:delete:wf-greet" },
      ],
    });
    mockScheduleCommand.mockResolvedValue(TIME_PICKER);
    await renderLifeMode();

    fireEvent.click(screen.getByText("🔄 工作流"));
    fireEvent.click(screen.getByText("📋 工作流列表"));
    await waitFor(() => screen.getByText("📅 排程執行 wf-greet"));

    fireEvent.click(screen.getByText("📅 排程執行 wf-greet"));

    await waitFor(() =>
      expect(mockScheduleCommand).toHaveBeenCalledWith("add_for_wf wf-greet"),
    );
    await waitFor(() => screen.getByText(/設定時間/));
  });

  it("🗑 刪除 button calls runWorkflowCommand('delete <id>') then refreshes list", async () => {
    mockWorkflowCommand
      .mockResolvedValueOnce({
        status: "ok",
        message: "📋 Workflows",
        actions: [
          { label: "▶️ 執行 wf-greet", callback_data: "wf:run:wf-greet" },
          { label: "📅 排程執行 wf-greet", callback_data: "wf:schedule:wf-greet" },
          { label: "🗑 刪除 wf-greet", callback_data: "wf:delete:wf-greet" },
        ],
      })
      .mockResolvedValueOnce({
        status: "ok",
        message: "✅ 已刪除 workflow 'wf-greet'",
        actions: [],
      })
      .mockResolvedValueOnce({
        status: "ok",
        message: "📋 Workflows\n• wf-other：其它（1 步驟）",
        actions: [
          { label: "▶️ 執行 wf-other", callback_data: "wf:run:wf-other" },
          { label: "📅 排程執行 wf-other", callback_data: "wf:schedule:wf-other" },
          { label: "🗑 刪除 wf-other", callback_data: "wf:delete:wf-other" },
        ],
      });
    await renderLifeMode();

    fireEvent.click(screen.getByText("🔄 工作流"));
    fireEvent.click(screen.getByText("📋 工作流列表"));
    await waitFor(() => screen.getByText("🗑 刪除 wf-greet"));

    fireEvent.click(screen.getByText("🗑 刪除 wf-greet"));

    await waitFor(() => expect(mockWorkflowCommand).toHaveBeenCalledWith("delete wf-greet"));
    await waitFor(() => expect(mockWorkflowCommand).toHaveBeenLastCalledWith("list"));
    await waitFor(() => screen.getByText(/已刪除 workflow 'wf-greet'/));
    await waitFor(() => screen.getByText("🗑 刪除 wf-other"));
  });

  it("生活 mode schedule capture routes 完成 to schedule instead of music", async () => {
    mockWorkflowCommand.mockResolvedValue({
      status: "ok",
      message: "📋 Workflows",
      actions: [
        { label: "▶️ 執行 wf-greet", callback_data: "wf:run:wf-greet" },
        { label: "📅 排程執行 wf-greet", callback_data: "wf:schedule:wf-greet" },
      ],
    });
    mockScheduleCommand
      .mockResolvedValueOnce(TIME_PICKER)
      .mockResolvedValueOnce(CAPTURE_HINT)
      .mockResolvedValueOnce(DONE_RESPONSE);
    mockScheduleAction.mockResolvedValue(CAPTURE_HINT);
    await renderLifeMode();

    fireEvent.click(screen.getByText("🔄 工作流"));
    fireEvent.click(screen.getByText("📋 工作流列表"));
    await waitFor(() => screen.getByText("📅 排程執行 wf-greet"));

    fireEvent.click(screen.getByText("📅 排程執行 wf-greet"));
    await waitFor(() => screen.getByText("✅ 下一步"));

    fireEvent.click(screen.getByText("✅ 下一步"));
    await waitFor(() => screen.getByText(/排程設定中/));

    sendText("完成");

    await waitFor(() => expect(mockScheduleCommand).toHaveBeenCalledWith("完成"));
    expect(mockMusicCommand).not.toHaveBeenCalledWith("完成");
  });
});

// Capture-mode regression tests (web#9 state bug)
describe("App — capture-mode not opened by list/picker responses (web#9)", () => {
  it("after 工作流列表, next chat text goes to streamCommand not runWorkflowCommand", async () => {
    mockWorkflowCommand.mockResolvedValue({
      status: "ok",
      message: "📋 Workflows",
      actions: [
        { label: "▶️ 執行 wf-greet", callback_data: "wf:run:wf-greet" },
        { label: "📅 排程執行 wf-greet", callback_data: "wf:schedule:wf-greet" },
      ],
    });
    mockStream.mockImplementation(async (_req, onEvent) => {
      onEvent({ type: "done", message: "普通聊天回覆" });
    });

    render(<App />);
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());

    // Show workflow list in life mode.
    fireEvent.click(screen.getByText("生活"));
    fireEvent.click(screen.getByText("🔄 工作流"));
    fireEvent.click(screen.getByText("📋 工作流列表"));
    await waitFor(() => screen.getByText("▶️ 執行 wf-greet"));

    sendText("普通聊天");

    await waitFor(() => screen.getByText("普通聊天回覆"));
    expect(mockStream).toHaveBeenCalledTimes(1);
    expect(mockWorkflowCommand).not.toHaveBeenCalledWith("普通聊天");
    expect(mockMusicCommand).not.toHaveBeenCalledWith("普通聊天");
  });

  it("after 排程列表, next chat text goes to streamCommand not runScheduleHomeCommand", async () => {
    mockScheduleCommand.mockResolvedValue({
      status: "ok",
      message: "🏠 家庭排程\n目前沒有任何排程。",
      actions: [{ label: "➕ 新增排程", callback_data: "sh:add" }],
    });
    mockStream.mockImplementation(async (_req, onEvent) => {
      onEvent({ type: "done", message: "普通聊天回覆" });
    });

    render(<App />);
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());

    // Show schedule list in life mode.
    fireEvent.click(screen.getByText("生活"));
    fireEvent.click(screen.getByText("📅 排程"));
    fireEvent.click(screen.getByText("📅 排程列表"));
    await waitFor(() => screen.getByText("➕ 新增排程"));

    sendText("普通聊天");

    await waitFor(() => screen.getByText("普通聊天回覆"));
    expect(mockStream).toHaveBeenCalledTimes(1);
    expect(mockScheduleCommand).not.toHaveBeenCalledWith("普通聊天");
    expect(mockMusicCommand).not.toHaveBeenCalledWith("普通聊天");
  });
});
