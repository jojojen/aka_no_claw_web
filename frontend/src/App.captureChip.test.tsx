// Web#10: CaptureModeChip UX — chip visibility, ✕ exit wiring, placeholder hints.
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
const mockStream = vi.mocked(client.streamCommand);
const mockWorkflowCommand = vi.mocked(client.runWorkflowCommand);
const mockWorkflowAction = vi.mocked(client.runWorkflowAction);
const mockScheduleCommand = vi.mocked(client.runScheduleHomeCommand);
const mockScheduleAction = vi.mocked(client.runScheduleHomeAction);

function emptySession() {
  return { status: "ok" as const, session: emptySnapshot() };
}

const EDITOR_RESPONSE = {
  status: "ok" as const,
  message: "📋 Workflow 草稿",
  actions: [
    { label: "儲存", callback_data: "wfe:save" },
    { label: "取消", callback_data: "wfe:cancel" },
  ],
};

const CANCEL_WF_RESPONSE = {
  status: "ok" as const,
  message: "已取消工作流",
  actions: [],
};

const SCHED_CAPTURE_HINT = {
  status: "ok" as const,
  message: "排程設定中，請輸入指令",
  actions: [
    { label: "完成", callback_data: "sh:done" },
    { label: "取消", callback_data: "sh:cancel" },
  ],
};

const CANCEL_SCHED_RESPONSE = {
  status: "ok" as const,
  message: "已取消排程",
  actions: [],
};

function sendText(text: string) {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
  fireEvent.click(screen.getByText("送出"));
}

async function enterWorkflowCapture() {
  mockStream.mockImplementation(async (_req, onEvent) => {
    onEvent({ type: "redirect", intent: "create_workflow", description: "每天早上問候我" });
  });
  mockWorkflowCommand.mockResolvedValue(EDITOR_RESPONSE);
  render(<App />);
  await waitFor(() => expect(mockLoad).toHaveBeenCalled());
  sendText("建立 workflow");
  await waitFor(() => screen.getByText(/Workflow 草稿/));
}

async function enterScheduleCapture() {
  mockStream.mockImplementation(async (_req, onEvent) => {
    onEvent({ type: "redirect", intent: "create_schedule", description: "新增排程" });
  });
  mockScheduleCommand.mockResolvedValue(SCHED_CAPTURE_HINT);
  render(<App />);
  await waitFor(() => expect(mockLoad).toHaveBeenCalled());
  sendText("新增排程");
  await waitFor(() => screen.getByText(/排程設定中/));
}

beforeEach(() => {
  vi.mocked(client.saveSession).mockResolvedValue({ status: "ok" });
  mockLoad.mockResolvedValue(emptySession());
  mockStream.mockReset();
  mockWorkflowCommand.mockReset();
  mockWorkflowAction.mockReset();
  mockScheduleCommand.mockReset();
  mockScheduleAction.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("CaptureModeChip — workflow", () => {
  it("chip is hidden when neither capture mode is active", async () => {
    mockStream.mockImplementation(async () => {});
    render(<App />);
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());
    expect(screen.queryByText("📝 工作流編輯中")).toBeNull();
    expect(screen.queryByText("⏰ 排程編輯中")).toBeNull();
  });

  it("workflow chip appears when workflowActive is true", async () => {
    await enterWorkflowCapture();
    expect(screen.getByText("📝 工作流編輯中")).toBeTruthy();
  });

  it("placeholder changes to workflow hint while workflowActive", async () => {
    await enterWorkflowCapture();
    expect(screen.getByRole("textbox").getAttribute("placeholder")).toContain("工作流編輯中");
  });

  it("✕ sends wfe:cancel and clears workflow capture mode", async () => {
    mockWorkflowAction.mockResolvedValue(CANCEL_WF_RESPONSE);
    await enterWorkflowCapture();

    fireEvent.click(screen.getByLabelText("退出編輯"));

    await waitFor(() => expect(mockWorkflowAction).toHaveBeenCalledWith("wfe:cancel"));
    await waitFor(() => screen.getByText("已取消工作流"));
    await waitFor(() => expect(screen.queryByText("📝 工作流編輯中")).toBeNull());
  });

  it("after ✕ exit, chat input routes to streamCommand not workflow endpoint", async () => {
    mockWorkflowAction.mockResolvedValue(CANCEL_WF_RESPONSE);
    mockStream
      .mockImplementationOnce(async (_req, onEvent) => {
        onEvent({ type: "redirect", intent: "create_workflow", description: "每天早上問候我" });
      })
      .mockImplementationOnce(async (_req, onEvent) => {
        onEvent({ type: "done", message: "聊天回覆" });
      });
    mockWorkflowCommand.mockResolvedValue(EDITOR_RESPONSE);
    render(<App />);
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());

    sendText("建立 workflow");
    await waitFor(() => screen.getByText(/Workflow 草稿/));

    fireEvent.click(screen.getByLabelText("退出編輯"));
    await waitFor(() => screen.getByText("已取消工作流"));

    sendText("繼續聊天");
    await waitFor(() => screen.getByText("聊天回覆"));
    expect(mockStream).toHaveBeenCalledTimes(2);
    expect(mockWorkflowCommand).toHaveBeenCalledTimes(1);
  });
});

describe("CaptureModeChip — schedule", () => {
  it("schedule chip appears when scheduleActive is true", async () => {
    await enterScheduleCapture();
    expect(screen.getByText("⏰ 排程編輯中")).toBeTruthy();
  });

  it("placeholder changes to schedule hint while scheduleActive", async () => {
    await enterScheduleCapture();
    expect(screen.getByRole("textbox").getAttribute("placeholder")).toContain("排程編輯中");
  });

  it("✕ sends sh:cancel and clears schedule capture mode", async () => {
    mockScheduleAction.mockResolvedValue(CANCEL_SCHED_RESPONSE);
    await enterScheduleCapture();

    fireEvent.click(screen.getByLabelText("退出編輯"));

    await waitFor(() => expect(mockScheduleAction).toHaveBeenCalledWith("sh:cancel"));
    await waitFor(() => screen.getByText("已取消排程"));
    await waitFor(() => expect(screen.queryByText("⏰ 排程編輯中")).toBeNull());
  });

  it("after ✕ exit, chat input routes to streamCommand not schedule endpoint", async () => {
    mockScheduleAction.mockResolvedValue(CANCEL_SCHED_RESPONSE);
    mockStream
      .mockImplementationOnce(async (_req, onEvent) => {
        onEvent({ type: "redirect", intent: "create_schedule", description: "新增排程" });
      })
      .mockImplementationOnce(async (_req, onEvent) => {
        onEvent({ type: "done", message: "聊天回覆" });
      });
    mockScheduleCommand.mockResolvedValue(SCHED_CAPTURE_HINT);
    render(<App />);
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());

    sendText("新增排程");
    await waitFor(() => screen.getByText(/排程設定中/));

    fireEvent.click(screen.getByLabelText("退出編輯"));
    await waitFor(() => screen.getByText("已取消排程"));

    sendText("繼續聊天");
    await waitFor(() => screen.getByText("聊天回覆"));
    expect(mockStream).toHaveBeenCalledTimes(2);
    expect(mockScheduleCommand).toHaveBeenCalledTimes(1);
  });
});
