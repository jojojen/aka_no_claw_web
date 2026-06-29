// Tests for web#3/#4 (music panel + volume), web#7 (生活 mode split into
// 音樂 / 藍牙), and the first 家電 IR shortcut. Each music button dispatches the same callback_data the Telegram
// bot uses, so the bridge runs the identical music/list handlers — the phone
// never reimplements playback or filesystem logic. The 藍牙 sub-panel only fires
// the scan trigger; discovered devices come back as backend action buttons.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LifeActionPanel } from "./LifeActionPanel";

function renderPanel(overrides: Partial<{
  disabled: boolean;
  onMusicAction: (cb: string) => void;
  onBluetoothScan: () => void;
  onAppliancePower: () => void;
}> = {}) {
  return render(
    <LifeActionPanel
      disabled={overrides.disabled ?? false}
      onMusicAction={overrides.onMusicAction ?? vi.fn()}
      onBluetoothScan={overrides.onBluetoothScan ?? vi.fn()}
      onAppliancePower={overrides.onAppliancePower ?? vi.fn()}
    />,
  );
}

describe("LifeActionPanel — category split (#7)", () => {
  it("shows the 音樂 / 藍牙 / 家電 category toggles", () => {
    renderPanel();
    expect(screen.getByText(/音樂/)).toBeDefined();
    expect(screen.getByText(/藍牙/)).toBeDefined();
    expect(screen.getByText(/家電/)).toBeDefined();
  });

  it("defaults to the 音樂 sub-panel (music buttons visible, scan hidden)", () => {
    renderPanel();
    expect(screen.getByText(/隨機播放/)).toBeDefined();
    expect(screen.queryByText(/掃描藍牙裝置/)).toBeNull();
  });

  it("switches to the 藍牙 sub-panel when 藍牙 is clicked", () => {
    renderPanel();
    fireEvent.click(screen.getByText("🔵 藍牙"));
    expect(screen.getByText(/掃描藍牙裝置/)).toBeDefined();
    expect(screen.queryByText(/隨機播放/)).toBeNull();
  });

  it("switches to the 家電 sub-panel when 家電 is clicked", () => {
    renderPanel();
    fireEvent.click(screen.getByText("🏠 家電"));
    expect(screen.getByText(/燈（開關）/)).toBeDefined();
    expect(screen.queryByText(/隨機播放/)).toBeNull();
    expect(screen.queryByText(/掃描藍牙裝置/)).toBeNull();
  });
});

describe("LifeActionPanel — music controls (#3/#4)", () => {
  it("renders all 6 playback action buttons", () => {
    renderPanel();
    expect(screen.getByText(/隨機播放/)).toBeDefined();
    expect(screen.getByText(/停止播放/)).toBeDefined();
    expect(screen.getByText(/瀏覽全部歌曲/)).toBeDefined();
    expect(screen.getByText(/最愛清單/)).toBeDefined();
    expect(screen.getByText(/播放最愛/)).toBeDefined();
    expect(screen.getByText(/加入最愛/)).toBeDefined();
  });

  it("renders the 上一首 / 暫停／繼續 / 下一首 queue-nav buttons (#60)", () => {
    renderPanel();
    expect(screen.getByText(/上一首/)).toBeDefined();
    expect(screen.getByText(/暫停/)).toBeDefined();
    expect(screen.getByText(/下一首/)).toBeDefined();
  });

  it("renders 靜音, 音量降低, 音量提高", () => {
    renderPanel();
    expect(screen.getByText(/靜音/)).toBeDefined();
    expect(screen.getByText(/音量降低/)).toBeDefined();
    expect(screen.getByText(/音量提高/)).toBeDefined();
  });

  it("renders the 切換音源 output-device button", () => {
    renderPanel();
    expect(screen.getByText(/切換音源/)).toBeDefined();
  });

  it("disables every music button when disabled=true", () => {
    renderPanel({ disabled: true });
    const buttons = screen
      .getAllByRole("button")
      // category toggles stay enabled so the user can still switch tabs
      .filter((b) => !/音樂|藍牙|家電/.test(b.textContent ?? ""));
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((btn) =>
      expect((btn as HTMLButtonElement).disabled).toBe(true),
    );
  });
});

// Dispatch table: every hardcoded music button must fire the right callback_data
// through onMusicAction. Folder navigation, song detail, and favorites are
// backend-driven action buttons (not hardcoded here) and are exercised via the
// commandClient music tests.
const DISPATCH_CASES: [RegExp, string][] = [
  [/隨機播放/, "music:rnd"],
  [/停止播放/, "music:stop"],
  [/瀏覽全部歌曲/, "music:ls:root:0"],
  [/最愛清單/, "pg:mb:0:r"],
  [/播放最愛/, "music:pb"],
  [/加入最愛/, "music:now"],
  [/上一首/, "music:prev"],
  [/暫停/, "music:playpause"],
  [/下一首/, "music:next"],
  [/靜音/, "music:mute"],
  [/音量降低/, "music:lower"],
  [/音量提高/, "music:louder"],
  [/切換音源/, "music:dev"],
];

describe.each(DISPATCH_CASES)(
  "clicking %s dispatches callbackData %s",
  (pattern, cbData) => {
    it("dispatches the correct callback_data to onMusicAction", () => {
      const onMusicAction = vi.fn();
      renderPanel({ onMusicAction });
      fireEvent.click(screen.getByText(pattern));
      expect(onMusicAction).toHaveBeenCalledWith(cbData);
    });
  },
);

describe("LifeActionPanel — bluetooth sub-panel (#7)", () => {
  it("fires onBluetoothScan when the scan button is clicked", () => {
    const onBluetoothScan = vi.fn();
    renderPanel({ onBluetoothScan });
    fireEvent.click(screen.getByText("🔵 藍牙"));
    fireEvent.click(screen.getByText(/掃描藍牙裝置/));
    expect(onBluetoothScan).toHaveBeenCalledTimes(1);
  });

  it("disables the scan button when disabled=true", () => {
    renderPanel({ disabled: true });
    fireEvent.click(screen.getByText("🔵 藍牙"));
    const scan = screen.getByText(/掃描藍牙裝置/).closest("button");
    expect((scan as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("LifeActionPanel — appliance IR sub-panel", () => {
  it("fires onAppliancePower when 燈（開關） is clicked", () => {
    const onAppliancePower = vi.fn();
    renderPanel({ onAppliancePower });
    fireEvent.click(screen.getByText("🏠 家電"));
    fireEvent.click(screen.getByText(/燈（開關）/));
    expect(onAppliancePower).toHaveBeenCalledTimes(1);
  });

  it("disables the appliance button when disabled=true", () => {
    renderPanel({ disabled: true });
    fireEvent.click(screen.getByText("🏠 家電"));
    const power = screen.getByText(/燈（開關）/).closest("button");
    expect((power as HTMLButtonElement).disabled).toBe(true);
  });
});
