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
        aria-label="選擇圖片"
        title="選擇圖片"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-muted text-text hover:bg-mutedHover disabled:opacity-50"
      >
        <svg
          data-icon="paperclip"
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m9.5 12.5 5.6-5.6a3.2 3.2 0 0 1 4.5 4.5l-8.1 8.1a5 5 0 0 1-7.1-7.1l8-8a2.9 2.9 0 0 1 4.1 4.1l-8 8a1.5 1.5 0 0 1-2.1-2.1l7.5-7.5" />
        </svg>
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
