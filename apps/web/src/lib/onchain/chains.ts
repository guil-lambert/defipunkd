/**
 * Chain support for the read API.
 *
 * Maps numeric EVM chainIds to a viem `Chain` object plus the Alchemy
 * subdomain slug used to build the RPC URL. Only chains that Alchemy actually
 * serves are listed here — calling a chain Alchemy doesn't support would just
 * return an opaque DNS error at request time, so we fail fast in the route.
 *
 * Reference: https://docs.alchemy.com/reference/api-overview
 */
import * as viemChains from "viem/chains";
import type { Chain } from "viem";

export interface ChainEntry {
  /** Lowercase canonical name we echo back in JSON responses (matches packages/enrichment/src/chain-id.ts where possible). */
  name: string;
  viemChain: Chain;
  /** Alchemy subdomain slug, e.g. "eth-mainnet" → https://eth-mainnet.g.alchemy.com/v2/<key> */
  alchemySlug: string;
}

const SUPPORTED: Record<number, ChainEntry> = {
  1: { name: "ethereum", viemChain: viemChains.mainnet, alchemySlug: "eth-mainnet" },
  10: { name: "optimism", viemChain: viemChains.optimism, alchemySlug: "opt-mainnet" },
  137: { name: "polygon", viemChain: viemChains.polygon, alchemySlug: "polygon-mainnet" },
  42161: { name: "arbitrum", viemChain: viemChains.arbitrum, alchemySlug: "arb-mainnet" },
  8453: { name: "base", viemChain: viemChains.base, alchemySlug: "base-mainnet" },
  59144: { name: "linea", viemChain: viemChains.linea, alchemySlug: "linea-mainnet" },
  534352: { name: "scroll", viemChain: viemChains.scroll, alchemySlug: "scroll-mainnet" },
  81457: { name: "blast", viemChain: viemChains.blast, alchemySlug: "blast-mainnet" },
  324: { name: "zksync", viemChain: viemChains.zksync, alchemySlug: "zksync-mainnet" },
  43114: { name: "avalanche", viemChain: viemChains.avalanche, alchemySlug: "avax-mainnet" },
  56: { name: "bsc", viemChain: viemChains.bsc, alchemySlug: "bnb-mainnet" },
  130: { name: "unichain", viemChain: viemChains.unichain, alchemySlug: "unichain-mainnet" },
  11155111: { name: "sepolia", viemChain: viemChains.sepolia, alchemySlug: "eth-sepolia" },
};

export function getChainEntry(chainId: number): ChainEntry | null {
  return SUPPORTED[chainId] ?? null;
}

export function isSupportedChainId(chainId: number): boolean {
  return chainId in SUPPORTED;
}

export function listSupportedChainIds(): number[] {
  return Object.keys(SUPPORTED).map(Number).sort((a, b) => a - b);
}
