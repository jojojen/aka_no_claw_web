import type { ActionButton, Message } from "../types/command";
import { FlatActionButton } from "./FlatActionButton";

function groupByRow(actions: ActionButton[]): ActionButton[][] {
  const map = new Map<number, ActionButton[]>();
  for (const a of actions) {
    const r = a.row ?? 0;
    if (!map.has(r)) map.set(r, []);
    map.get(r)!.push(a);
  }
  return [...map.keys()].sort((a, b) => a - b).map((k) => map.get(k)!);
}

type Props = {
  message: Message;
  onAction: (messageId: string, jobId: string, callbackData: string) => void;
};

export function MessageBubble({ message, onAction }: Props) {
  const isUser = message.role === "user";
  const base = "max-w-[85%] whitespace-pre-wrap break-words rounded px-3 py-2 text-sm leading-relaxed";
  const tone = isUser
    ? "bg-primary text-white self-end"
    : "bg-white text-text self-start border border-muted";

  const actions = message.actions ?? [];
  const canAction = !!message.jobId && !message.generating;

  return (
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      {message.modeLabel && !isUser && (
        <span className="mb-1 text-[11px] text-text/50">{message.modeLabel}</span>
      )}
      <div className={`${base} ${tone}`}>
        {message.text}
        {message.generating && <span className="ml-1 animate-pulse text-accent">▍</span>}
      </div>
      {actions.length > 0 && (
        <div className="mt-2 flex max-w-[85%] flex-col gap-2 self-start">
          {groupByRow(actions).map((row, i) => (
            <div key={i} className="flex flex-wrap gap-2">
              {row.map((a) => (
                <FlatActionButton
                  key={a.callback_data}
                  variant="muted"
                  disabled={!canAction}
                  onClick={() =>
                    message.jobId && onAction(message.id, message.jobId, a.callback_data)
                  }
                >
                  {a.label}
                </FlatActionButton>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
