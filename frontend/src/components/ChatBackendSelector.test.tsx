import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChatBackendSelector } from "./ChatBackendSelector";

describe("ChatBackendSelector", () => {
  it("shows Gemini after Mistral and renames cloud pickle to Big Pickle", () => {
    const onChange = vi.fn();
    render(<ChatBackendSelector backend="local" onChange={onChange} />);

    const labels = screen.getAllByRole("button").map((b) => b.textContent);
    expect(labels).toEqual(["本地模型", "Mistral", "Gemini", "Big Pickle"]);
  });

  it("selects the Gemini backend", () => {
    const onChange = vi.fn();
    render(<ChatBackendSelector backend="local" onChange={onChange} />);

    fireEvent.click(screen.getByText("Gemini"));

    expect(onChange).toHaveBeenCalledWith("gemini");
  });
});
