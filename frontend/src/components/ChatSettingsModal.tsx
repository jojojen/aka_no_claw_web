import { useEffect, useState } from "react";
import type { ChatSettings, ChatBackend, LlmProvider } from "../types/command";

type Props = {
  open: boolean;
  settings: ChatSettings | null;
  saving?: boolean;
  onClose: () => void;
  onSave: (settings: ChatSettings) => void;
};

function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from === to) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function ChatSettingsModal({ open, settings, saving = false, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<ChatSettings | null>(settings);

  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  if (!open || !draft) return null;

  const updateProvider = (provider: LlmProvider, patch: Partial<ChatSettings["providers"][LlmProvider]>) => {
    setDraft((prev) => prev ? {
      ...prev,
      providers: {
        ...prev.providers,
        [provider]: { ...prev.providers[provider], ...patch },
      },
    } : prev);
  };

  const setDefaultProvider = (backend: ChatBackend) => {
    setDraft((prev) => (prev ? { ...prev, default_chat_provider: backend } : prev));
  };

  const reorderPool = (index: number, dir: -1 | 1) => {
    setDraft((prev) => (prev ? {
      ...prev,
      cloud_pool: moveItem(prev.cloud_pool, index, index + dir),
    } : prev));
  };

  const updateVisionProvider = (provider: LlmProvider, patch: Partial<ChatSettings["vision_providers"][LlmProvider]>) => {
    setDraft((prev) => prev ? {
      ...prev,
      vision_providers: {
        ...prev.vision_providers,
        [provider]: { ...(prev.vision_providers[provider] || prev.providers[provider]), ...patch },
      },
    } : prev);
  };

  const reorderVisionPool = (index: number, dir: -1 | 1) => {
    setDraft((prev) => (prev ? {
      ...prev,
      vision_pool: moveItem(prev.vision_pool, index, index + dir),
    } : prev));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 px-3 py-4 sm:items-center">
      <div className="w-full max-w-xl rounded border border-muted bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-muted px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-text">聊天模型設定</h2>
            <p className="text-xs text-text/60">Web Chat 與 Telegram 共用</p>
          </div>
          <button
            onClick={onClose}
            className="rounded bg-muted px-2 py-1 text-xs text-text hover:bg-mutedHover"
            aria-label="關閉設定"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[75vh] space-y-5 overflow-y-auto px-4 py-4">
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-text/70">預設聊天後端</h3>
            <div className="flex flex-wrap gap-2">
              {draft.default_provider_options.map((option) => {
                const active = draft.default_chat_provider === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={saving}
                    onClick={() => setDefaultProvider(option.value)}
                    className={
                      `rounded px-3 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60 ` +
                      (active ? "bg-accent text-white" : "bg-muted text-text hover:bg-mutedHover")
                    }
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-text/70">雲端池順序</h3>
            <div className="space-y-2">
              {draft.cloud_pool.map((provider, index) => (
                <div
                  key={provider}
                  className="flex items-center justify-between rounded border border-muted px-3 py-2"
                >
                  <div className="text-sm text-text">{draft.providers[provider].label}</div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      disabled={saving || index === 0}
                      onClick={() => reorderPool(index, -1)}
                      className="rounded bg-muted px-2 py-1 text-xs text-text hover:bg-mutedHover disabled:opacity-40"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={saving || index === draft.cloud_pool.length - 1}
                      onClick={() => reorderPool(index, 1)}
                      className="rounded bg-muted px-2 py-1 text-xs text-text hover:bg-mutedHover disabled:opacity-40"
                    >
                      ↓
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {(["gemini", "mistral", "big_pickle", "nvidia", "local"] as LlmProvider[]).map((provider) => (
            <section key={provider} className="space-y-3 rounded border border-muted px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-text">{draft.providers[provider].label}</h3>
                  {!draft.providers[provider].configured && (
                    <p className="text-xs text-amber-700">未設 API key 或目前不可用</p>
                  )}
                </div>
                <label className="flex items-center gap-2 text-xs text-text/70">
                  <input
                    type="checkbox"
                    disabled={saving}
                    checked={draft.providers[provider].enabled}
                    onChange={(e) => updateProvider(provider, { enabled: e.target.checked })}
                    className="mint-choice size-4 shrink-0 cursor-pointer disabled:cursor-not-allowed"
                  />
                  啟用
                </label>
              </div>
              <div className="grid gap-2">
                {draft.model_options[provider].map((model) => (
                  <label
                    key={model}
                    className="flex items-center gap-2 rounded border border-muted px-3 py-2 text-sm"
                  >
                    <input
                      type="radio"
                      disabled={saving}
                      name={`model-${provider}`}
                      checked={draft.providers[provider].model === model}
                      onChange={() => updateProvider(provider, { model })}
                      className="mint-choice size-4 shrink-0 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <span>{model}</span>
                  </label>
                ))}
              </div>
            </section>
          ))}

          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-text/70">多模態池順序</h3>
            <p className="text-xs text-text/50">上傳圖片時使用的視覺模型池</p>
            <div className="space-y-2">
              {draft.vision_pool.map((provider, index) => (
                <div
                  key={provider}
                  className="flex items-center justify-between rounded border border-muted px-3 py-2"
                >
                  <div className="text-sm text-text">
                    {(draft.vision_providers[provider] || draft.providers[provider]).label}
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      disabled={saving || index === 0}
                      onClick={() => reorderVisionPool(index, -1)}
                      className="rounded bg-muted px-2 py-1 text-xs text-text hover:bg-mutedHover disabled:opacity-40"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={saving || index === draft.vision_pool.length - 1}
                      onClick={() => reorderVisionPool(index, 1)}
                      className="rounded bg-muted px-2 py-1 text-xs text-text hover:bg-mutedHover disabled:opacity-40"
                    >
                      ↓
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {(["gemini", "mistral", "big_pickle", "nvidia", "local"] as LlmProvider[]).map((provider) => {
            const vp = draft.vision_providers[provider];
            if (!vp) return null;
            return (
              <section key={`vision-${provider}`} className="space-y-3 rounded border border-muted px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-text">{vp.label}（多模態）</h3>
                    {!vp.configured && (
                      <p className="text-xs text-amber-700">未設 API key 或目前不可用</p>
                    )}
                  </div>
                  <label className="flex items-center gap-2 text-xs text-text/70">
                    <input
                      type="checkbox"
                      disabled={saving}
                      checked={vp.enabled}
                      onChange={(e) => updateVisionProvider(provider, { enabled: e.target.checked })}
                      className="mint-choice size-4 shrink-0 cursor-pointer disabled:cursor-not-allowed"
                    />
                    啟用
                  </label>
                </div>
                <div className="grid gap-2">
                  {(draft.vision_model_options[provider] || []).map((model) => (
                    <label
                      key={model}
                      className="flex items-center gap-2 rounded border border-muted px-3 py-2 text-sm"
                    >
                      <input
                        type="radio"
                        disabled={saving}
                        name={`vision-model-${provider}`}
                        checked={vp.model === model}
                        onChange={() => updateVisionProvider(provider, { model })}
                        className="mint-choice size-4 shrink-0 cursor-pointer disabled:cursor-not-allowed"
                      />
                      <span>{model}</span>
                    </label>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-muted px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-muted px-3 py-1 text-xs text-text hover:bg-mutedHover"
          >
            取消
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => onSave(draft)}
            className="rounded bg-accent px-3 py-1 text-xs text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "儲存中..." : "儲存"}
          </button>
        </div>
      </div>
    </div>
  );
}
