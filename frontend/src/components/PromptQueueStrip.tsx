import type { QueuedPrompt } from "../types/command";
import { useState } from "react";

type Props = {
  entries: QueuedPrompt[];
  onCancel: (entry: QueuedPrompt) => void;
  onEdit: (entry: QueuedPrompt, text: string) => void;
  onRetry: (entry: QueuedPrompt) => void;
  onMove: (promptId: string, direction: -1 | 1) => void;
};

export function PromptQueueStrip({ entries, onCancel, onEdit, onRetry, onMove }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  if (!entries.length) return null;
  return (
    <section aria-label="待送出訊息" className="border-t border-muted bg-muted/30 px-3 py-2">
      <p className="mb-1 text-xs font-medium text-text/70">待送出（{entries.length}）</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {entries.map((entry, index) => (
          <div key={entry.prompt_id} className="flex min-w-52 items-center gap-1 rounded bg-surface px-2 py-1 text-xs shadow-sm">
            {entry.status === "draining" ? (
              <span className="min-w-0 flex-1 truncate text-text/70" title={entry.text}>處理中：{entry.text}</span>
            ) : entry.status === "interrupted" ? (
              <span className="min-w-0 flex-1 truncate text-amber-800" title={entry.text}>執行中斷：{entry.text}</span>
            ) : editing === entry.prompt_id ? (
              <form
                className="flex min-w-0 flex-1 items-center gap-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  const text = draft.trim();
                  if (!text) return;
                  onEdit(entry, text);
                  setEditing(null);
                }}
              >
                <input aria-label="編輯待送出訊息內容" value={draft} onChange={(event) => setDraft(event.target.value)} className="min-w-0 flex-1 rounded border border-muted bg-surface px-1 py-2" />
                <button type="submit" aria-label="儲存待送出訊息" className="min-h-11 rounded px-2 text-text/70">儲存</button>
              </form>
            ) : (
              <span className="min-w-0 flex-1 truncate" title={entry.text}>{index + 1}. {entry.text}</span>
            )}
            {entry.status === "queued" && <>
              <button type="button" aria-label="編輯待送出訊息" onClick={() => { setEditing(entry.prompt_id); setDraft(entry.text); }} className="min-h-11 min-w-11 rounded text-text/70">編輯</button>
              <button type="button" aria-label="上移待送出訊息" disabled={entries.filter((item) => item.status === "queued" && item.intent === "next_turn").findIndex((item) => item.prompt_id === entry.prompt_id) === 0} onClick={() => onMove(entry.prompt_id, -1)} className="min-h-11 min-w-11 rounded text-text/70 disabled:opacity-30">↑</button>
              <button type="button" aria-label="下移待送出訊息" disabled={entries.filter((item) => item.status === "queued" && item.intent === "next_turn").findIndex((item) => item.prompt_id === entry.prompt_id) === entries.filter((item) => item.status === "queued" && item.intent === "next_turn").length - 1} onClick={() => onMove(entry.prompt_id, 1)} className="min-h-11 min-w-11 rounded text-text/70 disabled:opacity-30">↓</button>
              <button type="button" aria-label="取消待送出訊息" onClick={() => onCancel(entry)} className="min-h-11 min-w-11 rounded text-red-700">✕</button>
            </>}
            {entry.status === "interrupted" && <>
              <button type="button" aria-label="重試中斷訊息" onClick={() => onRetry(entry)} className="min-h-11 rounded px-2 text-text/70">重試</button>
              <button type="button" aria-label="取消中斷訊息" onClick={() => onCancel(entry)} className="min-h-11 min-w-11 rounded text-red-700">✕</button>
            </>}
          </div>
        ))}
      </div>
    </section>
  );
}
