import type { Submode } from "../types/command";
import { FlatActionButton } from "./FlatActionButton";

const SUBMODES: { value: Submode; label: string }[] = [
  { value: "deep_product_research", label: "商品深入研究" },
  { value: "seller_reputation_snapshot", label: "賣家信譽快照" },
];

type Props = {
  submode: Submode;
  onChange: (submode: Submode) => void;
};

export function InvestmentActionPanel({ submode, onChange }: Props) {
  return (
    <div className="flex gap-2">
      {SUBMODES.map((s) => (
        <FlatActionButton
          key={s.value}
          variant={s.value === submode ? "active" : "muted"}
          onClick={() => onChange(s.value)}
          className="flex-1"
        >
          {s.label}
        </FlatActionButton>
      ))}
    </div>
  );
}
