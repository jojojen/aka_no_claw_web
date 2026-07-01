import type { ChatBackend } from "../types/command";

const BACKENDS: { value: ChatBackend; label: string }[] = [
  { value: "cloud_pool", label: "雲端池" },
  { value: "cloud_mistral", label: "Mistral" },
  { value: "gemini", label: "Gemini" },
  { value: "cloud_pickle", label: "OpenCode" },
  { value: "local", label: "本地" },
];

type Props = {
  backend: ChatBackend;
  onChange: (backend: ChatBackend) => void;
  disabled?: boolean;
};

export function ChatBackendSelector({ backend, onChange, disabled }: Props) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="shrink-0 whitespace-nowrap text-text/60">模型</span>
      <div className="grid min-w-0 flex-1 grid-cols-5 gap-1">
        {BACKENDS.map((b) => {
          const active = b.value === backend;
          return (
            <button
              key={b.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(b.value)}
              title={b.label}
              aria-label={b.label}
              className={
                `min-w-0 truncate whitespace-nowrap rounded px-2 py-1 text-[11px] leading-none transition-colors disabled:opacity-50 sm:px-3 sm:text-xs ` +
                (active ? "bg-accent text-white" : "bg-muted text-text hover:bg-mutedHover")
              }
            >
              {b.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
