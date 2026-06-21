import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "active" | "muted";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

const VARIANT_CLASS: Record<Variant, string> = {
  primary: "bg-primary text-white hover:opacity-90",
  active: "bg-accent text-white",
  muted: "bg-muted text-text hover:bg-mutedHover",
};

export function FlatActionButton({ variant = "muted", className = "", ...rest }: Props) {
  return (
    <button
      {...rest}
      className={
        `rounded px-4 py-2 text-sm font-medium transition-colors ` +
        `disabled:opacity-50 disabled:cursor-default ${VARIANT_CLASS[variant]} ${className}`
      }
    />
  );
}
