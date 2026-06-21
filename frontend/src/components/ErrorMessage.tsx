type Props = { text: string };

// Rendered inside the conversation stream (never a browser alert).
export function ErrorMessage({ text }: Props) {
  return (
    <div className="self-start max-w-[85%] rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
      {text}
    </div>
  );
}
