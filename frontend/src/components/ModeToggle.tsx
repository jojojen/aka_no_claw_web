import type { Mode } from "../types/command";

const MODES: { value: Mode; label: string }[] = [
  { value: "chat", label: "Chat" },
  { value: "translation", label: "翻譯" },
  { value: "investment", label: "投資研究" },
  { value: "life", label: "生活" },
];

type Props = {
  mode: Mode;
  onChange: (mode: Mode) => void;
};

export function ModeToggle({ mode, onChange }: Props) {
  return (
    <div className="flex gap-2" role="tablist" aria-label="模式選擇">
      {MODES.map((m) => {
        const active = m.value === mode;
        return (
          <button
            key={m.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(m.value)}
            className={
              `flex-1 whitespace-nowrap rounded py-2 text-sm font-medium transition-colors ` +
              (active ? "bg-accent text-white" : "bg-muted text-text hover:bg-mutedHover")
            }
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
