import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
      onTranscribe={vi.fn().mockResolvedValue(undefined)}
    />,
  );
  return {
    textarea: screen.getByPlaceholderText("輸入訊息...") as HTMLTextAreaElement,
    sendButton: screen.getByText("送出"),
    onSend,
  };
}

describe("InputBar", () => {
  beforeEach(() => {
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  });

  afterEach(() => {
    Reflect.deleteProperty(window, "isSecureContext");
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

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

  it("shows an HTTPS error without opening a file picker when recording APIs are unavailable", async () => {
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
    vi.stubGlobal("MediaRecorder", undefined);
    renderInputBar();

    fireEvent.click(screen.getByRole("button", { name: "開始語音輸入" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "此連線無法直接錄音，請改用 HTTPS 開啟 Web UI。",
    );
    expect(screen.queryByLabelText("選擇音訊檔案")).toBeNull();
  });

  it("shows an error and opens no picker in an insecure LAN context", async () => {
    const original = Object.getOwnPropertyDescriptor(window, "isSecureContext");
    const getUserMedia = vi.fn();
    Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia },
      configurable: true,
    });
    vi.stubGlobal("MediaRecorder", class { static isTypeSupported = () => true; });
    try {
      renderInputBar();

      fireEvent.click(screen.getByRole("button", { name: "開始語音輸入" }));

      expect(getUserMedia).not.toHaveBeenCalled();
      expect((await screen.findByRole("alert")).textContent).toContain("請改用 HTTPS");
    } finally {
      if (original) Object.defineProperty(window, "isSecureContext", original);
      else Reflect.deleteProperty(window, "isSecureContext");
    }
  });

  it("records until the second tap, releases the microphone, and transcribes the blob", async () => {
    const stopTrack = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia },
      configurable: true,
    });
    class FakeMediaRecorder {
      static isTypeSupported = () => true;
      state = "inactive";
      mimeType = "audio/webm;codecs=opus";
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onerror: (() => void) | null = null;
      onstop: (() => void) | null = null;
      start(_timeslice?: number) { this.state = "recording"; }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob(["voice"], { type: this.mimeType }) });
        this.onstop?.();
      }
    }
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    const onTranscribe = vi.fn().mockResolvedValue(undefined);
    render(
      <InputBar
        placeholder="輸入訊息..."
        mode="chat"
        generating={false}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onSelectImage={vi.fn()}
        onTranscribe={onTranscribe}
      />,
    );

    const startButton = screen.getByRole("button", { name: "開始語音輸入" });
    expect(startButton.querySelector('[data-icon="microphone"]')).toBeTruthy();
    expect(startButton.textContent).not.toContain("🎙");
    fireEvent.click(startButton);
    expect(await screen.findByRole("button", { name: "停止錄音" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "停止錄音" }).querySelector('[data-icon="stop-recording"]'),
    ).toBeTruthy();
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    fireEvent.click(screen.getByRole("button", { name: "停止錄音" }));

    await vi.waitFor(() => expect(onTranscribe).toHaveBeenCalledTimes(1));
    expect(onTranscribe.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(onTranscribe.mock.calls[0][0].type).toBe("audio/webm;codecs=opus");
    expect(stopTrack).toHaveBeenCalledTimes(1);
  });

  it("shows a useful error when microphone permission is denied", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn().mockRejectedValue(
          new DOMException("denied", "NotAllowedError"),
        ),
      },
      configurable: true,
    });
    vi.stubGlobal("MediaRecorder", class { static isTypeSupported = () => true; });
    renderInputBar();

    fireEvent.click(screen.getByRole("button", { name: "開始語音輸入" }));

    expect((await screen.findByRole("alert")).textContent).toContain("允許瀏覽器的麥克風權限");
  });

  it("disables voice input while a response is generating", () => {
    render(
      <InputBar
        placeholder="輸入訊息..."
        mode="chat"
        generating
        onSend={vi.fn()}
        onStop={vi.fn()}
        onSelectImage={vi.fn()}
        onTranscribe={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect((screen.getByRole("button", { name: "開始語音輸入" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("aligns all controls at the 44px baseline while letting the textarea grow", () => {
    renderInputBar();

    const controls = [
      screen.getByRole("button", { name: "選擇圖片" }),
      screen.getByRole("button", { name: "開始語音輸入" }),
      screen.getByText("送出"),
    ];
    for (const control of controls) {
      expect(control.className.split(/\s+/)).toContain("h-11");
    }
    // The textarea matches the buttons on one line but must auto-grow for
    // multi-line input, so it uses min/max bounds instead of a fixed h-11.
    const textareaClasses = (screen.getByRole("textbox") as HTMLTextAreaElement).className.split(/\s+/);
    expect(textareaClasses).toEqual(expect.arrayContaining(["min-h-11", "max-h-40"]));
    expect(textareaClasses).not.toContain("h-11");
  });

  it("renders the image picker as an accessible paperclip icon for images only", () => {
    renderInputBar();
    const button = screen.getByRole("button", { name: "選擇圖片" });
    const imageInput = document.querySelector('input[type="file"][accept="image/*"]');

    expect(button.getAttribute("title")).toBe("選擇圖片");
    expect(button.className.split(/\s+/)).toEqual(expect.arrayContaining(["h-11", "w-11"]));
    expect(button.querySelector('[data-icon="paperclip"]')).toBeTruthy();
    expect(imageInput).toBeTruthy();
  });

  it("hides mobile accessories on textarea focus and restores them after blur", async () => {
    const { textarea } = renderInputBar();
    const accessories = screen.getByTestId("input-accessories");

    expect(accessories.className.split(/\s+/)).toContain("flex");
    expect(accessories.className.split(/\s+/)).not.toContain("hidden");

    fireEvent.focus(textarea);

    expect(accessories.className.split(/\s+/)).toEqual(expect.arrayContaining(["hidden", "sm:flex"]));
    expect(textarea.className.split(/\s+/)).toContain("flex-1");

    fireEvent.blur(textarea);
    await waitFor(() => expect(accessories.className.split(/\s+/)).not.toContain("hidden"));
  });

  it("does not lose a send click while blur restores the mobile accessories", () => {
    const onSend = vi.fn();
    const { textarea, sendButton } = renderInputBar(onSend);
    fireEvent.change(textarea, { target: { value: "聚焦後送出" } });
    fireEvent.focus(textarea);
    expect(screen.getByTestId("input-accessories").className).toContain("hidden");

    // Browser ordering is blur before click. Restoration is deferred so the
    // send target does not move away between those two events.
    fireEvent.blur(textarea);
    fireEvent.click(sendButton);

    expect(onSend).toHaveBeenCalledWith("聚焦後送出");
  });
});
