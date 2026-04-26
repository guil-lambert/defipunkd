/**
 * Chain-name → numeric chain-id mapping.
 *
 * Uses the lower-cased adapter chain key (as it appears in module.exports keys
 * or in `chain: "..."` strings) → EVM chain id.  Only chains that BOTH
 * Etherscan v2 and our adapter universe care about are listed; non-EVM and
 * unsupported chains return null and the caller should skip the address.
 *
 * Reference: https://docs.etherscan.io/etherscan-v2/getting-started/v2-quickstart
 */

const MAP: Record<string, number> = {
  ethereum: 1,
  optimism: 10,
  bsc: 56,
  gnosis: 100,
  xdai: 100, // alias for gnosis used by some adapters
  polygon: 137,
  fantom: 250,
  cronos: 25,
  moonbeam: 1284,
  moonriver: 1285,
  arbitrum: 42161,
  arbitrum_nova: 42170,
  avalanche: 43114,
  avax: 43114,
  celo: 42220,
  zksync: 324,
  era: 324, // adapter alias for zksync era
  polygon_zkevm: 1101,
  base: 8453,
  linea: 59144,
  scroll: 534352,
  mantle: 5000,
  blast: 81457,
  mode: 34443,
  fraxtal: 252,
  taiko: 167000,
  sonic: 146,
  berachain: 80094,
  metis: 1088,
  kava: 2222,
  aurora: 1313161554,
  klaytn: 8217,
  heco: 128,
  opbnb: 204,
  unichain: 130,
  manta: 169,
  zora: 7777777,
  sepolia: 11155111,
  holesky: 17000,
};

export function chainNameToId(chain: string | null): number | null {
  if (!chain) return null;
  return MAP[chain.toLowerCase()] ?? null;
}

export function isSupportedChain(chain: string | null): boolean {
  return chainNameToId(chain) !== null;
}
