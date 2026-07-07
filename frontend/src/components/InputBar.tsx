import { useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { Mode } from "../types/command";
import { FlatActionButton } from "./FlatActionButton";
import { AttachmentButton } from "./AttachmentButton";

type Props = {
  placeholder: string;
  mode: Mode;
  generating: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  onSelectImage: (file: File) => void;
};

export function InputBar({
  placeholder,
  mode,
  generating,
  onSend,
  onStop,
  onSelectImage,
}: Props) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  useLayoutEffect(() => {
    resizeTextarea();
  }, [value]);

  const submit = () => {
    const text = value.trim();
    if (!text) return;
    onSend(text);
    setValue("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex items-end gap-2 border-t border-muted bg-surface p-3">
      {(mode === "translation" || mode === "chat") && (
        <AttachmentButton onSelect={onSelectImage} disabled={generating} />
      )}
      <textarea
        ref={textareaRef}
        rows={1}
        enterKeyHint="enter"
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        className="max-h-40 min-h-11 flex-1 resize-none overflow-y-auto rounded border border-muted bg-white px-3 py-2 text-base leading-6 outline-none focus:border-primary"
      />
      {generating ? (
        <FlatActionButton variant="muted" onClick={onStop}>
          停止
        </FlatActionButton>
      ) : (
        <FlatActionButton variant="primary" onClick={submit}>
          送出
        </FlatActionButton>
      )}
    </div>
  );
}
