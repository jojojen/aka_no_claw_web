import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InputBar } from "./InputBar";

function renderInputBar(onSend = vi.fn()) {
  render(
    <InputBar
      placeholder="輸入訊息..."
      mode="chat"
      generating={false}
      onSend={onSend}
      onStop={vi.fn()}
      onSelectImage={vi.fn()}
    />,
  );
  return {
    textarea: screen.getByPlaceholderText("輸入訊息...") as HTMLTextAreaElement,
    sendButton: screen.getByText("送出"),
    onSend,
  };
}

describe("InputBar", () => {
  it("keeps newline text and sends it with the button", () => {
    const { textarea, sendButton, onSend } = renderInputBar();

    fireEvent.change(textarea, { target: { value: "第一行\n第二行" } });
    fireEvent.click(sendButton);

    expect(onSend).toHaveBeenCalledWith("第一行\n第二行");
  });

  it("does not submit on plain Enter", () => {
    const { textarea, onSend } = renderInputBar();

    fireEvent.change(textarea, { target: { value: "第一行" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onSend).not.toHaveBeenCalled();
  });

  it("submits on command Enter", () => {
    const { textarea, onSend } = renderInputBar();

    fireEvent.change(textarea, { target: { value: "第一行\n第二行" } });
    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });

    expect(onSend).toHaveBeenCalledWith("第一行\n第二行");
  });

  it("submits on control Enter", () => {
    const { textarea, onSend } = renderInputBar();

    fireEvent.change(textarea, { target: { value: "第一行\n第二行" } });
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });

    expect(onSend).toHaveBeenCalledWith("第一行\n第二行");
  });
});
