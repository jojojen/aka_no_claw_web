import { useRef } from "react";

type Props = {
  onSelect: (file: File) => void;
  disabled?: boolean;
};

// Local file picker only — no camera integration in this MVP.
export function AttachmentButton({ onSelect, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="rounded bg-muted px-3 py-2 text-sm text-text hover:bg-mutedHover disabled:opacity-50"
      >
        選擇圖片
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onSelect(file);
          e.target.value = "";
        }}
      />
    </>
  );
}
