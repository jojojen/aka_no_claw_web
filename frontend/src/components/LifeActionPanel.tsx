import { FlatActionButton } from "./FlatActionButton";

// 生活 mode splits into categories (web#7 + IR controls + web#9): 音樂, 藍牙, 家電, 工作流, 排程.
// The category toggle is local UI state; actions route through the bridge so the phone
// never reimplements playback, Bluetooth, IR, workflow, or schedule logic.
export type LifeCategory = "music" | "bluetooth" | "appliance" | "workflow" | "schedule";

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
  onFanPower: () => void;
  onFanWeaker: () => void;
  onFanStronger: () => void;
  onWorkflowList: () => void;
  onScheduleList: () => void;
  category: LifeCategory;
  onCategoryChange: (category: LifeCategory) => void;
};

export function LifeActionPanel({
  disabled,
  onMusicAction,
  onBluetoothScan,
  onAppliancePower,
  onFanPower,
  onFanWeaker,
  onFanStronger,
  onWorkflowList,
  onScheduleList,
  category,
  onCategoryChange,
}: Props) {
  function switchCategory(next: LifeCategory) {
    onCategoryChange(next);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        <FlatActionButton
          variant={category === "music" ? "active" : "muted"}
          onClick={() => switchCategory("music")}
        >
          🎵 音樂
        </FlatActionButton>
        <FlatActionButton
          variant={category === "bluetooth" ? "active" : "muted"}
          onClick={() => switchCategory("bluetooth")}
        >
          🔵 藍牙
        </FlatActionButton>
        <FlatActionButton
          variant={category === "appliance" ? "active" : "muted"}
          onClick={() => switchCategory("appliance")}
        >
          🏠 家電
        </FlatActionButton>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <FlatActionButton
          variant={category === "workflow" ? "active" : "muted"}
          onClick={() => switchCategory("workflow")}
        >
          🔄 工作流
        </FlatActionButton>
        <FlatActionButton
          variant={category === "schedule" ? "active" : "muted"}
          onClick={() => switchCategory("schedule")}
        >
          📅 排程
        </FlatActionButton>
      </div>

      <div className="border-t border-muted" />

      {category === "music" && (
        <MusicControls disabled={disabled} onAction={onMusicAction} />
      )}
      {category === "bluetooth" && (
        <BluetoothControls disabled={disabled} onScan={onBluetoothScan} />
      )}
      {category === "appliance" && (
        <ApplianceControls
          disabled={disabled}
          onLightPower={onAppliancePower}
          onFanPower={onFanPower}
          onFanWeaker={onFanWeaker}
          onFanStronger={onFanStronger}
        />
      )}
      {category === "workflow" && (
        <WorkflowControls disabled={disabled} onList={onWorkflowList} />
      )}
      {category === "schedule" && (
        <ScheduleControls disabled={disabled} onList={onScheduleList} />
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

// 家電 exposes IR shortcuts as a remote. Each command is owned by OpenClaw
// (`/ir send ceiling_light power`, `/ir send fan power`,
// `/ir send fan weaker`/`stronger`); these buttons just relay.
function ApplianceControls({
  disabled,
  onLightPower,
  onFanPower,
  onFanWeaker,
  onFanStronger,
}: {
  disabled: boolean;
  onLightPower: () => void;
  onFanPower: () => void;
  onFanWeaker: () => void;
  onFanStronger: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <FlatActionButton variant="muted" disabled={disabled} onClick={onLightPower}>
          💡 燈（開關）
        </FlatActionButton>
        <FlatActionButton variant="muted" disabled={disabled} onClick={onFanPower}>
          🌀 電扇（開關）
        </FlatActionButton>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <FlatActionButton variant="muted" disabled={disabled} onClick={onFanWeaker}>
          🌀 電扇（弱）
        </FlatActionButton>
        <FlatActionButton variant="muted" disabled={disabled} onClick={onFanStronger}>
          🌀 電扇（強）
        </FlatActionButton>
      </div>
    </div>
  );
}

// 工作流 sub-panel: list all saved workflows. Each workflow card returned by the
// bridge includes an "▶️ 排程執行" button (add_for_wf callback) so the user can
// schedule any workflow directly from the list.
function WorkflowControls({
  disabled,
  onList,
}: {
  disabled: boolean;
  onList: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <FlatActionButton variant="muted" disabled={disabled} onClick={onList}>
        📋 工作流列表
      </FlatActionButton>
    </div>
  );
}

// 排程 sub-panel: show the current schedule list with run/on/off/delete actions.
function ScheduleControls({
  disabled,
  onList,
}: {
  disabled: boolean;
  onList: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <FlatActionButton variant="muted" disabled={disabled} onClick={onList}>
        📅 排程列表
      </FlatActionButton>
    </div>
  );
}
