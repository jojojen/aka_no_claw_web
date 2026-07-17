import { useEffect, useRef } from "react";
import type { ApprovalView, CommandAction, Message } from "../types/command";
import { MessageBubble } from "./MessageBubble";
import type { VoiceClarifySelection } from "./MessageBubble";
import { ErrorMessage } from "./ErrorMessage";

type Props = {
  messages: Message[];
  onAction: (messageId: string, jobId: string, callbackData: string) => void;
  onChatAction: (action: CommandAction) => void;
  onVoiceClarify?: (messageId: string, selection: VoiceClarifySelection) => void;
  onVoiceDirectReject?: (messageId: string) => void;
  chatActionsDisabled?: boolean;
  onApproval?: (messageId: string, approval: ApprovalView, decision: "approve" | "reject") => void;
};

export function ConversationStream({ messages, onAction, onChatAction, onVoiceClarify, onVoiceDirectReject, chatActionsDisabled, onApproval }: Props) {
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
          <MessageBubble
            key={m.id}
            message={m}
            onAction={onAction}
            onChatAction={onChatAction}
            onVoiceClarify={onVoiceClarify}
            onVoiceDirectReject={onVoiceDirectReject}
            chatActionsDisabled={chatActionsDisabled}
            onApproval={onApproval}
          />
        ),
      )}
      <div ref={endRef} />
    </div>
  );
}
