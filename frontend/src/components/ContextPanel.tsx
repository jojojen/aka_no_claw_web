import type { ContextStatusResponse } from "../types/command";

type Props = {
  status: ContextStatusResponse | null;
  busy?: boolean;
  onCompact: () => void;
  onClear: () => void;
};

export function ContextPanel({ status, busy = false, onCompact, onClear }: Props) {
  if (!status || status.status !== "ok") return null;
  const checkpoint = status.checkpoint;
  return <section className="border-b border-muted px-4 py-3 text-sm" aria-label="對話摘要記憶">
    <div className="flex items-center justify-between gap-2">
      <span className="font-medium text-text">對話內容</span>
      <span className="text-text/60">約 {status.usage_percent ?? 0}%</span>
    </div>
    {checkpoint ? <details className="mt-2 text-text/70"><summary className="cursor-pointer">摘要：{checkpoint.summary_preview}</summary>
      <p className="mt-2 whitespace-pre-wrap">{checkpoint.summary ?? checkpoint.summary_preview}</p></details> :
      <p className="mt-2 text-text/60">尚未建立摘要記憶；完整聊天紀錄不會被刪除。</p>}
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" className="rounded bg-muted px-2 py-1 text-xs font-medium text-text transition-colors hover:bg-mutedHover disabled:opacity-50" onClick={onCompact} disabled={busy || !status.manual_compaction_allowed}>壓縮對話內容</button>
      {checkpoint && <button type="button" className="rounded bg-muted px-2 py-1 text-xs font-medium text-text transition-colors hover:bg-mutedHover disabled:opacity-50" onClick={onClear} disabled={busy}>清除摘要記憶</button>}
    </div>
  </section>;
}
