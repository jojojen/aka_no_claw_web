// Tests for web#3 (生活 mode music panel) and web#4 (volume controls).
// Each panel button dispatches the same callback_data the Telegram bot uses,
// so the bridge runs the identical music/list handlers — the phone never
// reimplements playback or filesystem logic.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LifeActionPanel } from "./LifeActionPanel";

describe("LifeActionPanel — music controls (#3)", () => {
  it("renders all 6 playback action buttons", () => {
    render(<LifeActionPanel disabled={false} onAction={vi.fn()} />);
    expect(screen.getByText(/隨機播放/)).toBeDefined();
    expect(screen.getByText(/停止播放/)).toBeDefined();
    expect(screen.getByText(/瀏覽全部歌曲/)).toBeDefined();
    expect(screen.getByText(/最愛清單/)).toBeDefined();
    expect(screen.getByText(/播放最愛/)).toBeDefined();
    expect(screen.getByText(/加入最愛/)).toBeDefined();
  });

  it("disables every button when disabled=true", () => {
    render(<LifeActionPanel disabled={true} onAction={vi.fn()} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((btn) =>
      expect((btn as HTMLButtonElement).disabled).toBe(true),
    );
  });
});

describe("LifeActionPanel — volume controls (#4)", () => {
  it("renders 靜音, 音量降低, 音量提高", () => {
    render(<LifeActionPanel disabled={false} onAction={vi.fn()} />);
    expect(screen.getByText(/靜音/)).toBeDefined();
    expect(screen.getByText(/音量降低/)).toBeDefined();
    expect(screen.getByText(/音量提高/)).toBeDefined();
  });
});

// Dispatch table: every hardcoded panel button must fire the right callback_data.
// Folder navigation, song detail, and favorites are backend-driven action buttons
// (not hardcoded here) and are exercised via the commandClient music tests.
const DISPATCH_CASES: [RegExp, string][] = [
  [/隨機播放/, "music:rnd"],
  [/停止播放/, "music:stop"],
  [/瀏覽全部歌曲/, "music:ls:root:0"],
  [/最愛清單/, "pg:mb:0:r"],
  [/播放最愛/, "music:pb"],
  [/加入最愛/, "music:now"],
  [/靜音/, "music:mute"],       // #4
  [/音量降低/, "music:lower"],  // #4
  [/音量提高/, "music:louder"], // #4
];

describe.each(DISPATCH_CASES)(
  "clicking %s dispatches callbackData %s",
  (pattern, cbData) => {
    it("dispatches the correct callback_data to onAction", () => {
      const onAction = vi.fn();
      render(<LifeActionPanel disabled={false} onAction={onAction} />);
      fireEvent.click(screen.getByText(pattern));
      expect(onAction).toHaveBeenCalledWith(cbData);
    });
  },
);
