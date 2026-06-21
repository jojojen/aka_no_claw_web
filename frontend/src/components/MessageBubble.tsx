import type { Message } from "../types/command";

type Props = { message: Message };

export function MessageBubble({ message }: Props) {
  const isUser = message.role === "user";
  const base = "max-w-[85%] whitespace-pre-wrap break-words rounded px-3 py-2 text-sm leading-relaxed";
  const tone = isUser
    ? "bg-primary text-white self-end"
    : "bg-white text-text self-start border border-muted";

  return (
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      {message.modeLabel && !isUser && (
        <span className="mb-1 text-[11px] text-text/50">{message.modeLabel}</span>
      )}
      <div className={`${base} ${tone}`}>
        {message.text}
        {message.generating && <span className="ml-1 animate-pulse text-accent">▍</span>}
      </div>
    </div>
  );
}
