type Props = {
  mode: "workflow" | "schedule";
  onExit: () => void;
};

export function CaptureModeChip({ mode, onExit }: Props) {
  const label = mode === "workflow" ? "📝 工作流編輯中" : "⏰ 排程編輯中";
  return (
    <div className="flex items-center gap-2 border-t border-muted bg-muted/40 px-3 py-1.5">
      <span className="text-[12px] text-text/60">{label}</span>
      <button
        type="button"
        onClick={onExit}
        aria-label="退出編輯"
        className="ml-auto rounded border border-muted bg-muted/40 px-1.5 py-0.5 text-[11px] text-text/60 hover:bg-mutedHover"
      >
        ✕
      </button>
    </div>
  );
}
