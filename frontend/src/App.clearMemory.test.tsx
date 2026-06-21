// App-level clear-memory behavior tests (issue #2).
// Uses a synchronous debounce mock so save effects fire immediately —
// no fake-timer machinery needed to assert whether saveSession was called.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("./session", async () => {
  const actual = await vi.importActual<typeof import("./session")>("./session");
  return {
    ...actual,
    // Replace debounce with a synchronous wrapper so saves are observable immediately.
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
}));

import App from "./App";
import * as client from "./api/commandClient";
import { emptySnapshot } from "./session";

const mockLoad = vi.mocked(client.loadSession);
const mockSave = vi.mocked(client.saveSession);
const mockClear = vi.mocked(client.clearSession);

function sessionWith(text: string) {
  return {
    status: "ok" as const,
    session: { ...emptySnapshot(), messages: [{ id: "m1", role: "user" as const, text }] },
  };
}

beforeEach(() => {
  mockLoad.mockResolvedValue(sessionWith("hello clear test"));
  mockSave.mockResolvedValue({ status: "ok" });
  mockClear.mockResolvedValue({ status: "ok" });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("App — clear memory (#2)", () => {
  it("shows confirm buttons when 清除記憶 is clicked", async () => {
    render(<App />);
    await waitFor(() => screen.getByText("hello clear test"));
    fireEvent.click(screen.getByText("清除記憶"));
    expect(screen.getByText("確定清除")).toBeDefined();
    expect(screen.getByText("取消")).toBeDefined();
  });

  it("取消 dismisses confirm UI without clearing messages", async () => {
    render(<App />);
    await waitFor(() => screen.getByText("hello clear test"));
    fireEvent.click(screen.getByText("清除記憶"));
    fireEvent.click(screen.getByText("取消"));
    expect(screen.queryByText("確定清除")).toBeNull();
    expect(screen.getByText("hello clear test")).toBeDefined();
  });

  it("DELETE failure keeps messages visible and shows error notice", async () => {
    mockClear.mockResolvedValueOnce({ status: "error", message: "disk full" });
    render(<App />);
    await waitFor(() => screen.getByText("hello clear test"));
    fireEvent.click(screen.getByText("清除記憶"));
    fireEvent.click(screen.getByText("確定清除"));
    await waitFor(() => screen.getByText(/disk full/));
    expect(screen.getByText("hello clear test")).toBeDefined();
  });

  it("DELETE success clears visible messages", async () => {
    render(<App />);
    await waitFor(() => screen.getByText("hello clear test"));
    fireEvent.click(screen.getByText("清除記憶"));
    fireEvent.click(screen.getByText("確定清除"));
    await waitFor(() => expect(screen.queryByText("hello clear test")).toBeNull());
  });

  it("does not re-save an empty snapshot after successful clear", async () => {
    render(<App />);
    await waitFor(() => screen.getByText("hello clear test"));
    mockSave.mockClear();

    fireEvent.click(screen.getByText("清除記憶"));
    fireEvent.click(screen.getByText("確定清除"));
    await waitFor(() => expect(screen.queryByText("hello clear test")).toBeNull());

    // With synchronous debounce, any empty-snapshot save would have fired by now.
    const emptySaves = mockSave.mock.calls.filter(
      ([snap]) => Array.isArray((snap as { messages?: unknown[] }).messages) &&
                  (snap as { messages: unknown[] }).messages.length === 0,
    );
    expect(emptySaves).toHaveLength(0);
  });
});
