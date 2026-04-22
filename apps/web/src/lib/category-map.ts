export const TABS = [
  "All",
  "Lending",
  "DEX",
  "Yield",
  "Derivatives",
  "Bridges",
  "Liquid Staking",
  "CDP",
  "Stablecoins",
  "RWA",
  "Others",
] as const;

export type Tab = (typeof TABS)[number];

const RAW_TO_TAB: Record<string, Exclude<Tab, "All">> = {
  lending: "Lending",
  "liquid lending": "Lending",
  cdp: "CDP",
  dexes: "DEX",
  "dex aggregator": "DEX",
  yield: "Yield",
  "yield aggregator": "Yield",
  derivatives: "Derivatives",
  options: "Derivatives",
  perps: "Derivatives",
  "cross chain": "Bridges",
  bridge: "Bridges",
  "liquid staking": "Liquid Staking",
  "liquid restaking": "Liquid Staking",
  stablecoins: "Stablecoins",
  "algo-stables": "Stablecoins",
  "algorithmic stablecoins": "Stablecoins",
  "gov-backed stablecoins": "Stablecoins",
  rwa: "RWA",
  "rwa lending": "RWA",
};

export function bucketCategory(
  raw: string | null | undefined,
  onUnmapped?: (raw: string) => void,
): Exclude<Tab, "All"> {
  if (!raw || raw.trim() === "") return "Others";
  const key = raw.trim().toLowerCase();
  const mapped = RAW_TO_TAB[key];
  if (mapped) return mapped;
  if (onUnmapped) onUnmapped(raw);
  return "Others";
}
