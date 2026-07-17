import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { QueuedPrompt } from "../types/command";
import { PromptQueueStrip } from "./PromptQueueStrip";

const entry: QueuedPrompt = {
  prompt_id: "p-1", session_id: "s-1", version: 3, position: 0,
  intent: "next_turn", mode: "chat", text: "先做第一件事",
  created_at: 1, updated_at: 1, expires_at: 999, status: "queued",
};

describe("PromptQueueStrip", () => {
  it("edits, reorders, and cancels queued prompts", () => {
    const onCancel = vi.fn();
    const onEdit = vi.fn();
    const onMove = vi.fn();
    render(<PromptQueueStrip entries={[entry, { ...entry, prompt_id: "p-2", position: 1, text: "第二件事" }]} onCancel={onCancel} onEdit={onEdit} onRetry={vi.fn()} onMove={onMove} />);

    fireEvent.click(screen.getAllByRole("button", { name: "編輯待送出訊息" })[0]);
    fireEvent.change(screen.getByRole("textbox", { name: "編輯待送出訊息內容" }), { target: { value: "改過的第一件事" } });
    fireEvent.click(screen.getByRole("button", { name: "儲存待送出訊息" }));
    expect(onEdit).toHaveBeenCalledWith(entry, "改過的第一件事");

    fireEvent.click(screen.getAllByRole("button", { name: "下移待送出訊息" })[0]);
    expect(onMove).toHaveBeenCalledWith("p-1", 1);
    fireEvent.click(screen.getAllByRole("button", { name: "取消待送出訊息" })[1]);
    expect(onCancel).toHaveBeenCalledWith(expect.objectContaining({ prompt_id: "p-2" }));
  });

  it("labels a claimed prompt as processing and hides mutation controls", () => {
    render(<PromptQueueStrip entries={[{ ...entry, status: "draining" }]} onCancel={vi.fn()} onEdit={vi.fn()} onRetry={vi.fn()} onMove={vi.fn()} />);

    expect(screen.getByText("處理中：先做第一件事")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "編輯待送出訊息" })).toBeNull();
    expect(screen.queryByRole("button", { name: "取消待送出訊息" })).toBeNull();
  });

  it("offers explicit retry or cancel after a restart interrupted a prompt", () => {
    const interrupted = { ...entry, status: "interrupted" as const };
    const onRetry = vi.fn();
    const onCancel = vi.fn();
    render(<PromptQueueStrip entries={[interrupted]} onCancel={onCancel} onEdit={vi.fn()} onRetry={onRetry} onMove={vi.fn()} />);

    expect(screen.getByText("執行中斷：先做第一件事")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "重試中斷訊息" }));
    expect(onRetry).toHaveBeenCalledWith(interrupted);
    fireEvent.click(screen.getByRole("button", { name: "取消中斷訊息" }));
    expect(onCancel).toHaveBeenCalledWith(interrupted);
  });
});
