import { FlatActionButton } from "./FlatActionButton";

// 生活 mode music control surface (aka_no_claw_web#3 + #4). These are the only
// hardcoded controls; everything else (folders, songs, favorites) is rendered
// from backend-returned action buttons. callback_data mirrors the Telegram
// bot's music callbacks, so the bridge dispatches the very same handlers — the
// phone never reimplements playback or filesystem logic.
const PLAYBACK: { label: string; callbackData: string }[] = [
  { label: "🔀 隨機播放", callbackData: "music:rnd" },
  { label: "⏹ 停止播放", callbackData: "music:stop" },
  { label: "📁 瀏覽全部歌曲", callbackData: "music:ls:root:0" },
  { label: "⭐ 最愛清單", callbackData: "pg:mb:0:r" },
  { label: "▶️ 播放最愛", callbackData: "music:pb" },
  { label: "➕ 加入最愛(目前)", callbackData: "music:now" },
];

// web#4 — volume controls. Backend owns mute/volume state; louder/lower auto
// cancel mute, so the UI keeps no authoritative state of its own.
const VOLUME: { label: string; callbackData: string }[] = [
  { label: "🔇 靜音", callbackData: "music:mute" },
  { label: "🔉 音量降低", callbackData: "music:lower" },
  { label: "🔊 音量提高", callbackData: "music:louder" },
];

type Props = {
  disabled: boolean;
  onAction: (callbackData: string) => void;
};

export function LifeActionPanel({ disabled, onAction }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-text/50">音樂在 Mac mini 播放，手機只是遙控器。</p>
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
