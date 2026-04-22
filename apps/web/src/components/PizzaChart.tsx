import type { JSX } from "react";

export const PIZZA_SLICES = [
  { id: "chain-ownership", label: "Chain / ownership" },
  { id: "upgradeability", label: "Upgradeability" },
  { id: "exit-window", label: "Exit window" },
  { id: "autonomy", label: "Autonomy / accessibility" },
  { id: "oracle", label: "Oracle dependency" },
  { id: "external-deps", label: "External dependencies" },
  { id: "collateral", label: "Collateral risk" },
] as const;

export type PizzaSize = "sm" | "lg";

export function PizzaChart({ size = "lg" }: { size?: PizzaSize }): JSX.Element {
  const radius = size === "sm" ? 12 : 72;
  const stroke = size === "sm" ? 1 : 2;
  const cx = radius;
  const cy = radius;
  const slices = PIZZA_SLICES.length;
  const angle = (2 * Math.PI) / slices;
  const paths: JSX.Element[] = [];
  for (let i = 0; i < slices; i++) {
    const a0 = -Math.PI / 2 + i * angle;
    const a1 = a0 + angle;
    const x0 = cx + radius * Math.cos(a0);
    const y0 = cy + radius * Math.sin(a0);
    const x1 = cx + radius * Math.cos(a1);
    const y1 = cy + radius * Math.sin(a1);
    const slice = PIZZA_SLICES[i]!;
    paths.push(
      <a key={slice.id} href={`#${slice.id}`}>
        <path
          d={`M${cx},${cy} L${x0},${y0} A${radius},${radius} 0 0,1 ${x1},${y1} Z`}
          fill="#334155"
          stroke="#0f172a"
          strokeWidth={stroke}
        >
          <title>{`${slice.label} ${"\u2014"} unknown`}</title>
        </path>
      </a>,
    );
  }
  return (
    <svg
      width={radius * 2}
      height={radius * 2}
      viewBox={`0 0 ${radius * 2} ${radius * 2}`}
      role="img"
      aria-label="risk pizza (all unknown)"
    >
      {paths}
    </svg>
  );
}
