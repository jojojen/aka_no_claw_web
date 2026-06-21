import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModeToggle } from "./ModeToggle";

describe("ModeToggle", () => {
  it("renders all four modes including 生活", () => {
    render(<ModeToggle mode="chat" onChange={vi.fn()} />);
    expect(screen.getByText("Chat")).toBeDefined();
    expect(screen.getByText("翻譯")).toBeDefined();
    expect(screen.getByText("投資研究")).toBeDefined();
    expect(screen.getByText("生活")).toBeDefined();
  });

  it("生活 is a top-level mode — not nested or hidden", () => {
    render(<ModeToggle mode="chat" onChange={vi.fn()} />);
    const tab = screen.getByRole("tab", { name: "生活" });
    expect(tab).toBeDefined();
  });

  it("clicking 生活 calls onChange with 'life'", () => {
    const onChange = vi.fn();
    render(<ModeToggle mode="chat" onChange={onChange} />);
    fireEvent.click(screen.getByText("生活"));
    expect(onChange).toHaveBeenCalledWith("life");
  });

  it("active mode has aria-selected=true", () => {
    render(<ModeToggle mode="life" onChange={vi.fn()} />);
    expect(screen.getByRole("tab", { name: "生活" }).getAttribute("aria-selected")).toBe("true");
  });

  it("switching modes calls onChange exactly once with the right mode", () => {
    const onChange = vi.fn();
    render(<ModeToggle mode="chat" onChange={onChange} />);
    fireEvent.click(screen.getByText("投資研究"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("investment");
  });
});
