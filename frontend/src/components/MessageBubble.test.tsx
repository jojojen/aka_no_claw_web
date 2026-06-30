import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
