import { useState } from "react";
import { FlatActionButton } from "./FlatActionButton";

// 生活 mode splits into categories (web#7 + IR controls): 音樂, 藍牙, 家電. The category
// toggle is local UI state; the actual actions still route through the bridge so
// the phone never reimplements playback, Bluetooth, or IR logic.
type Category = "music" | "bluetooth" | "appliance";

// Music controls (web#3 + #4). These are the only hardcoded music buttons;
// folders/songs/favorites — and the 切換音源 output-device picker (music:dev) —
// come back as backend action buttons. callback_data mirrors the Telegram bot's
// music callbacks so the bridge runs the same handlers.
const PLAYBACK: { label: string; callbackData: string }[] = [
  { label: "🔀 隨機播放", callbackData: "music:rnd" },
  { label: "⏹ 停止播放", callbackData: "music:stop" },
  { label: "📁 瀏覽全部歌曲", callbackData: "music:ls:root:0" },
  { label: "⭐ 最愛清單", callbackData: "pg:mb:0:r" },
  { label: "▶️ 播放最愛", callbackData: "music:pb" },
  { label: "➕ 加入最愛(目前)", callbackData: "music:now" },
];

// Queue navigation (#60). 上一首／下一首 only act on an active queue
// (隨機播放 / 播放最愛); the bridge replies with guidance otherwise. ⏯ toggles
// pause/resume on the current track. callback_data mirrors the Telegram buttons.
const NAV: { label: string; callbackData: string }[] = [
  { label: "⏮ 上一首", callbackData: "music:prev" },
  { label: "⏯ 暫停/繼續", callbackData: "music:playpause" },
  { label: "⏭ 下一首", callbackData: "music:next" },
];

const VOLUME: { label: string; callbackData: string }[] = [
  { label: "🔇 靜音", callbackData: "music:mute" },
  { label: "🔉 音量降低", callbackData: "music:lower" },
  { label: "🔊 音量提高", callbackData: "music:louder" },
];

type Props = {
  disabled: boolean;
  onMusicAction: (callbackData: string) => void;
  onBluetoothScan: () => void;
  onAppliancePower: () => void;
};

export function LifeActionPanel({
  disabled,
  onMusicAction,
  onBluetoothScan,
  onAppliancePower,
}: Props) {
  const [category, setCategory] = useState<Category>("music");

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        <FlatActionButton
          variant={category === "music" ? "active" : "muted"}
          onClick={() => setCategory("music")}
        >
          🎵 音樂
        </FlatActionButton>
        <FlatActionButton
          variant={category === "bluetooth" ? "active" : "muted"}
          onClick={() => setCategory("bluetooth")}
        >
          🔵 藍牙
        </FlatActionButton>
        <FlatActionButton
          variant={category === "appliance" ? "active" : "muted"}
          onClick={() => setCategory("appliance")}
        >
          🏠 家電
        </FlatActionButton>
      </div>

      {category === "music" && (
        <MusicControls disabled={disabled} onAction={onMusicAction} />
      )}
      {category === "bluetooth" && (
        <BluetoothControls disabled={disabled} onScan={onBluetoothScan} />
      )}
      {category === "appliance" && (
        <ApplianceControls disabled={disabled} onPower={onAppliancePower} />
      )}
    </div>
  );
}

function MusicControls({
  disabled,
  onAction,
}: {
  disabled: boolean;
  onAction: (callbackData: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        {PLAYBACK.map((b) => (
          <FlatActionButton
            key={b.callbackData}
            variant="muted"
            disabled={disabled}
            onClick={() => onAction(b.callbackData)}
          >
            {b.label}
          </FlatActionButton>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {NAV.map((b) => (
          <FlatActionButton
            key={b.callbackData}
            variant="muted"
            disabled={disabled}
            onClick={() => onAction(b.callbackData)}
            className="whitespace-nowrap px-2"
          >
            {b.label}
          </FlatActionButton>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {VOLUME.map((b) => (
          <FlatActionButton
            key={b.callbackData}
            variant="muted"
            disabled={disabled}
            onClick={() => onAction(b.callbackData)}
          >
            {b.label}
          </FlatActionButton>
        ))}
      </div>
      <FlatActionButton
        variant="muted"
        disabled={disabled}
        onClick={() => onAction("music:dev")}
      >
        🔈 切換音源
      </FlatActionButton>
    </div>
  );
}

// The 藍牙 sub-panel only hosts the scan trigger; discovered devices come back as
// an assistant card whose buttons connect each device (matching music actions).
function BluetoothControls({
  disabled,
  onScan,
}: {
  disabled: boolean;
  onScan: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <FlatActionButton variant="muted" disabled={disabled} onClick={onScan}>
        🔍 掃描藍牙裝置
      </FlatActionButton>
    </div>
  );
}

// 家電 currently exposes the first IR shortcut only. The command itself is owned
// by OpenClaw (`/ir send ceiling_light power`); this button is just a remote.
function ApplianceControls({
  disabled,
  onPower,
}: {
  disabled: boolean;
  onPower: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <FlatActionButton variant="muted" disabled={disabled} onClick={onPower}>
        💡 燈（開關）
      </FlatActionButton>
    </div>
  );
}
