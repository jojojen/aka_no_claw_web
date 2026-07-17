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
    render(<PromptQueueStrip entries={[entry, { ...entry, prompt_id: "p-2", position: 1, text: "第二件事" }]} onCancel={onCancel} onEdit={onEdit} onMove={onMove} />);

    fireEvent.click(screen.getAllByRole("button", { name: "編輯待送出訊息" })[0]);
    fireEvent.change(screen.getByRole("textbox", { name: "編輯待送出訊息內容" }), { target: { value: "改過的第一件事" } });
    fireEvent.click(screen.getByRole("button", { name: "儲存待送出訊息" }));
    expect(onEdit).toHaveBeenCalledWith(entry, "改過的第一件事");

    fireEvent.click(screen.getAllByRole("button", { name: "下移待送出訊息" })[0]);
    expect(onMove).toHaveBeenCalledWith("p-1", 1);
    fireEvent.click(screen.getAllByRole("button", { name: "取消待送出訊息" })[1]);
    expect(onCancel).toHaveBeenCalledWith(expect.objectContaining({ prompt_id: "p-2" }));
  });
});
