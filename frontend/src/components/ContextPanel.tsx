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
  return <section className="mx-4 mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm" aria-label="對話摘要記憶">
    <div className="flex items-center justify-between gap-2">
      <span className="font-medium text-slate-700">對話內容</span>
      <span className="text-slate-500">約 {status.usage_percent ?? 0}%</span>
    </div>
    {checkpoint ? <details className="mt-2 text-slate-600"><summary className="cursor-pointer">摘要：{checkpoint.summary_preview}</summary>
      <p className="mt-2 whitespace-pre-wrap">{checkpoint.summary ?? checkpoint.summary_preview}</p></details> :
      <p className="mt-2 text-slate-500">尚未建立摘要記憶；完整聊天紀錄不會被刪除。</p>}
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" className="rounded-lg border px-3 py-1.5 disabled:opacity-50" onClick={onCompact} disabled={busy || !status.manual_compaction_allowed}>壓縮對話內容</button>
      {checkpoint && <button type="button" className="rounded-lg border px-3 py-1.5 disabled:opacity-50" onClick={onClear} disabled={busy}>清除摘要記憶</button>}
    </div>
  </section>;
}
