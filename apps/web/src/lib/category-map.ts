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
  "RWA",
  "Farm",
  "Launchpad",
  "Services",
  "Algo-Stables",
  "Interface",
  "Prediction Market",
  "Gaming",
  "SoFi",
  "CEX",
  "Indexes",
  "Staking Pool",
  "Options",
  "NFT Marketplace",
  "Liquidity Manager",
  "Risk Curators",
  "Leveraged Farming",
  "Synthetics",
  "Basis Trading",
  "Payments",
  "Privacy",
  "NFT Lending",
  "Insurance",
  "Reserve Currency",
  "Onchain Capital Allocator",
  "Chain",
  "Others",
] as const;

export const CHAIN_TABS = [
  "Ethereum",
  "Arbitrum",
  "Binance",
  "Base",
  "Polygon",
  "Avalanche",
  "Solana",
  "Optimism",
  "Bitcoin",
  "Hyperliquid L1",
  "Sui",
  "Aptos",
  "Cardano",
  "Tron",
  "TON",
] as const;

export type ChainTab = (typeof CHAIN_TABS)[number];
const CHAIN_TAB_SET = new Set<string>(CHAIN_TABS);
export function isChainTab(t: string): t is ChainTab {
  return CHAIN_TAB_SET.has(t);
}

export const DEFAULT_TAB: Tab = "DeFi";

export function isCexCategory(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return raw.trim().toLowerCase() === "cex";
}

export type CategoryTab = (typeof TABS)[number];
export type Tab = CategoryTab | ChainTab;
export type BucketTab = Exclude<CategoryTab, "All" | "DeFi">;

const RAW_TO_TAB: Record<string, BucketTab> = {
  lending: "Lending",
  "liquid lending": "Lending",
  "uncollateralized lending": "Lending",
  cdp: "CDP",
  dexs: "DEX",
  dexes: "DEX",
  "dex aggregator": "DEX",
  yield: "Yield",
  "yield aggregator": "Yield",
  derivatives: "Derivatives",
  perps: "Derivatives",
  "cross chain": "Bridges",
  bridge: "Bridges",
  "canonical bridge": "Bridges",
  "cross chain bridge": "Bridges",
  "bridge aggregator": "Bridges",
  "liquid staking": "Liquid Staking",
  "liquid restaking": "Liquid Staking",
  restaking: "Liquid Staking",
  rwa: "RWA",
  "rwa lending": "RWA",
  cex: "CEX",
  farm: "Farm",
  "leveraged farming": "Leveraged Farming",
  launchpad: "Launchpad",
  services: "Services",
  "algo-stables": "Algo-Stables",
  interface: "Interface",
  "prediction market": "Prediction Market",
  gaming: "Gaming",
  sofi: "SoFi",
  indexes: "Indexes",
  "staking pool": "Staking Pool",
  options: "Options",
  "options vault": "Options",
  "nft marketplace": "NFT Marketplace",
  "liquidity manager": "Liquidity Manager",
  "risk curators": "Risk Curators",
  synthetics: "Synthetics",
  "basis trading": "Basis Trading",
  payments: "Payments",
  privacy: "Privacy",
  "nft lending": "NFT Lending",
  insurance: "Insurance",
  "reserve currency": "Reserve Currency",
  chain: "Chain",
  "onchain capital allocator": "Onchain Capital Allocator",
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
