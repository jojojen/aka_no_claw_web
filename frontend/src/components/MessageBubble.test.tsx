import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MessageBubble } from "./MessageBubble";
import type { Message } from "../types/command";

describe("MessageBubble model metadata", () => {
  it("does not show model metadata when no fallback happened", () => {
    const message: Message = {
      id: "m1",
      role: "assistant",
      text: "回答",
      modelMetadata: {
        requested_provider: "gemini",
        requested_model: "gemini-2.5-pro",
        attempted_models: [{ provider: "gemini", model: "gemini-2.5-pro", status: "ok" }],
        final_provider: "gemini",
        final_model: "gemini-2.5-pro",
      },
    };

    render(<MessageBubble message={message} onAction={vi.fn()} />);

    expect(screen.queryByText(/本次回答模型/)).toBeNull();
  });

  it("shows final model and reason when fallback happened", () => {
    const message: Message = {
      id: "m1",
      role: "assistant",
      text: "回答",
      modelMetadata: {
        requested_provider: "gemini",
        requested_model: "gemini-2.5-pro",
        attempted_models: [
          { provider: "gemini", model: "gemini-2.5-pro", status: "quota_exhausted" },
          { provider: "gemini", model: "gemini-2.5-flash", status: "ok" },
        ],
        final_provider: "gemini",
        final_model: "gemini-2.5-flash",
        fallback_reason: "RESOURCE_EXHAUSTED",
      },
    };

    render(<MessageBubble message={message} onAction={vi.fn()} />);

    expect(screen.getByText(/本次回答模型：gemini gemini-2.5-flash/)).toBeDefined();
    expect(screen.getByText(/RESOURCE_EXHAUSTED/)).toBeDefined();
  });
});

describe("MessageBubble approval card", () => {
  const approval = {
    approval_id: "a", session_id: "s", run_id: "r", decision_token: "token",
    manifest_hash_prefix: "abc", expires_at: Date.now() / 1000 + 60,
    risk: "persistent_write", action_kind: "generated_tool.execute", tool_slug: "writer",
    requested_capabilities: ["filesystem_write"], network_scopes: ["example.com"],
    filesystem_scopes: ["local_workspace"], device_scopes: [], status: "pending",
  };

  it("shows bounded effects and submits approve once", () => {
    const onApproval = vi.fn();
    render(<MessageBubble message={{ id: "m", role: "assistant", text: "pending", approval }} onAction={vi.fn()} onApproval={onApproval} />);
    expect(screen.getByText(/網路：example.com/)).toBeDefined();
    fireEvent.click(screen.getByText("核准一次"));
    expect(onApproval).toHaveBeenCalledWith("m", approval, "approve");
  });

  it("requires a second deliberate click for destructive approval", () => {
    const onApproval = vi.fn();
    const destructive = { ...approval, risk: "destructive" };
    render(<MessageBubble message={{ id: "m", role: "assistant", text: "pending", approval: destructive }} onAction={vi.fn()} onApproval={onApproval} />);
    fireEvent.click(screen.getByText("核准一次"));
    expect(onApproval).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("再按一次確認"));
    expect(onApproval).toHaveBeenCalledWith("m", destructive, "approve");
  });
});
