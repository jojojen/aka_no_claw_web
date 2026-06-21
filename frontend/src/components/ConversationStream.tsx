import { useEffect, useRef } from "react";
import type { Message } from "../types/command";
import { MessageBubble } from "./MessageBubble";
import { ErrorMessage } from "./ErrorMessage";

type Props = {
  messages: Message[];
  onAction: (messageId: string, jobId: string, callbackData: string) => void;
};

export function ConversationStream({ messages, onAction }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-4">
      {messages.length === 0 && (
        <p className="m-auto text-sm text-text/40">在下方輸入訊息開始對話。</p>
      )}
      {messages.map((m) =>
        m.role === "assistant" && m.status === "error" ? (
          <ErrorMessage key={m.id} text={m.text} />
        ) : (
          <MessageBubble key={m.id} message={m} onAction={onAction} />
        ),
      )}
      <div ref={endRef} />
    </div>
  );
}
