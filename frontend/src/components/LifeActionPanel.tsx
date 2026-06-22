import { useState } from "react";
import { FlatActionButton } from "./FlatActionButton";

// 生活 mode now splits into two categories (web#7): 音樂 and 藍牙. The category
// toggle is local UI state; the actual actions still route through the bridge so
// the phone never reimplements playback or touches the OS Bluetooth stack.
type Category = "music" | "bluetooth";

// Music controls (web#3 + #4). These are the only hardcoded music buttons;
// folders/songs/favorites come back as backend action buttons. callback_data
// mirrors the Telegram bot's music callbacks so the bridge runs the same handlers.
const PLAYBACK: { label: string; callbackData: string }[] = [
  { label: "🔀 隨機播放", callbackData: "music:rnd" },
  { label: "⏹ 停止播放", callbackData: "music:stop" },
  { label: "📁 瀏覽全部歌曲", callbackData: "music:ls:root:0" },
  { label: "⭐ 最愛清單", callbackData: "pg:mb:0:r" },
  { label: "▶️ 播放最愛", callbackData: "music:pb" },
  { label: "➕ 加入最愛(目前)", callbackData: "music:now" },
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
};

export function LifeActionPanel({ disabled, onMusicAction, onBluetoothScan }: Props) {
  const [category, setCategory] = useState<Category>("music");

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
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
      </div>

      {category === "music" ? (
        <MusicControls disabled={disabled} onAction={onMusicAction} />
      ) : (
        <BluetoothControls disabled={disabled} onScan={onBluetoothScan} />
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
