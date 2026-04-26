/**
 * Safe Transaction Service uses per-chain endpoints with non-uniform names:
 *   safe-transaction-mainnet.safe.global       (NOT "ethereum")
 *   safe-transaction-gnosis-chain.safe.global  (NOT "gnosis")
 *
 * Map our internal chain names (which match adapter chain keys) to the slug
 * Safe expects. Chains absent from this map have no Safe TS deployment;
 * the caller should skip them rather than constructing a 404 URL.
 *
 * Reference: https://docs.safe.global/core-api/transaction-service-supported-networks
 */

const MAP: Record<string, string> = {
  ethereum: "mainnet",
  arbitrum: "arbitrum",
  optimism: "optimism",
  base: "base",
  polygon: "polygon",
  polygon_zkevm: "zkevm",
  bsc: "bsc",
  avalanche: "avalanche",
  avax: "avalanche",
  gnosis: "gnosis-chain",
  xdai: "gnosis-chain",
  celo: "celo",
  linea: "linea",
  mantle: "mantle",
  scroll: "scroll",
  blast: "blast",
  zksync: "zksync",
  era: "zksync",
  aurora: "aurora",
  worldchain: "worldchain",
  unichain: "unichain",
  // Sepolia / testnets omitted — adapter universe doesn't reference them.
};

export function chainNameToSafeSlug(chain: string | null): string | null {
  if (!chain) return null;
  return MAP[chain.toLowerCase()] ?? null;
}

export function isSupportedSafeChain(chain: string | null): boolean {
  return chainNameToSafeSlug(chain) !== null;
}
