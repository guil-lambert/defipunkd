export const TABS = [
  "All",
  "DeFi",
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

export const DEFAULT_TAB: Tab = "DeFi";

export function isCexCategory(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return raw.trim().toLowerCase() === "cex";
}

export type Tab = (typeof TABS)[number];
export type BucketTab = Exclude<Tab, "All" | "DeFi">;

const RAW_TO_TAB: Record<string, BucketTab> = {
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
): BucketTab {
  if (!raw || raw.trim() === "") return "Others";
  const key = raw.trim().toLowerCase();
  const mapped = RAW_TO_TAB[key];
  if (mapped) return mapped;
  if (onUnmapped) onUnmapped(raw);
  return "Others";
}
