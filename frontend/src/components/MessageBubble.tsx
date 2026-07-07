import type { ActionButton, CommandAction, Message } from "../types/command";
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

function modelMetaText(message: Message): string | null {
  const meta = message.modelMetadata;
  if (!meta || message.role !== "assistant") return null;
  const hasFallback = meta.fallback_occurred ?? (!!meta.fallback_reason && meta.attempted_models.length > 1);
  if (!hasFallback) return null;
  const finalModel = `${meta.final_provider} ${meta.final_model}`;
  const attempted = meta.attempted_models
    .map((a) => `${a.provider} ${a.model}: ${a.status}`)
    .join(" -> ");
  return `本次回答模型：${finalModel}。原因：${meta.fallback_reason ?? attempted}`;
}

type Props = {
  message: Message;
  onAction: (messageId: string, jobId: string, callbackData: string) => void;
  onChatAction?: (action: CommandAction) => void;
  chatActionsDisabled?: boolean;
};

export function MessageBubble({ message, onAction, onChatAction, chatActionsDisabled }: Props) {
  const isUser = message.role === "user";
  const base = "max-w-[85%] whitespace-pre-wrap break-words rounded px-3 py-2 text-sm leading-relaxed";
  const tone = isUser
    ? "bg-primary text-white self-end"
    : "bg-white text-text self-start border border-muted";

  const actions = message.actions ?? [];
  const canAction = !!message.jobId && !message.generating;
  const chatActions = message.chatActions ?? [];
  const canChatAction = !message.generating && !chatActionsDisabled;
  const metaText = modelMetaText(message);

  return (
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      {message.modeLabel && !isUser && (
        <span className="mb-1 text-[11px] text-text/50">{message.modeLabel}</span>
      )}
      <div className={`${base} ${tone}`}>
        {message.text}
        {message.generating && <span className="ml-1 animate-pulse text-accent">▍</span>}
      </div>
      {metaText && (
        <div className="mt-1 max-w-[85%] rounded border border-muted bg-muted/40 px-2 py-1 text-[11px] leading-relaxed text-text/65">
          {metaText}
        </div>
      )}
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
      {chatActions.length > 0 && (
        <div className="mt-2 flex max-w-[85%] flex-wrap gap-2 self-start">
          {chatActions.map((a, i) => (
            <FlatActionButton
              key={`${a.command}-${a.input ?? i}`}
              variant="muted"
              disabled={!canChatAction}
              onClick={() => onChatAction?.(a)}
            >
              {a.label}
            </FlatActionButton>
          ))}
        </div>
      )}
    </div>
  );
}
