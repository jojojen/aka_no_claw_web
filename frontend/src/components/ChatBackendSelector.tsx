import type { ChatBackend } from "../types/command";

const BACKENDS: { value: ChatBackend; label: string }[] = [
  { value: "local", label: "本地模型" },
  { value: "cloud_mistral", label: "Mistral" },
  { value: "gemini", label: "Gemini" },
  { value: "cloud_pickle", label: "Big Pickle" },
];

type Props = {
  backend: ChatBackend;
  onChange: (backend: ChatBackend) => void;
  disabled?: boolean;
};

export function ChatBackendSelector({ backend, onChange, disabled }: Props) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-text/60">模型</span>
      <div className="flex gap-1">
        {BACKENDS.map((b) => {
          const active = b.value === backend;
          return (
            <button
              key={b.value}
              disabled={disabled}
              onClick={() => onChange(b.value)}
              className={
                `rounded px-3 py-1 transition-colors disabled:opacity-50 ` +
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
