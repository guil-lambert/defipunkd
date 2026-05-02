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
  /**
   * Public RPC URL used as a fallback when Alchemy is unreachable or rate-limited.
   * No API key — these are free shared endpoints, slower with stricter limits, but
   * sufficient for degraded-but-working over a 502.
   */
  publicRpc: string;
}

const SUPPORTED: Record<number, ChainEntry> = {
  // PublicNode used for the chains where the obvious public RPC sits behind
  // Cloudflare bot protection (eth.llamarpc.com returns a JS challenge to
  // datacenter IPs, which makes it useless as a Vercel-side fallback).
  1: { name: "ethereum", viemChain: viemChains.mainnet, alchemySlug: "eth-mainnet", publicRpc: "https://ethereum-rpc.publicnode.com" },
  10: { name: "optimism", viemChain: viemChains.optimism, alchemySlug: "opt-mainnet", publicRpc: "https://mainnet.optimism.io" },
  137: { name: "polygon", viemChain: viemChains.polygon, alchemySlug: "polygon-mainnet", publicRpc: "https://polygon-rpc.com" },
  42161: { name: "arbitrum", viemChain: viemChains.arbitrum, alchemySlug: "arb-mainnet", publicRpc: "https://arb1.arbitrum.io/rpc" },
  8453: { name: "base", viemChain: viemChains.base, alchemySlug: "base-mainnet", publicRpc: "https://mainnet.base.org" },
  59144: { name: "linea", viemChain: viemChains.linea, alchemySlug: "linea-mainnet", publicRpc: "https://rpc.linea.build" },
  534352: { name: "scroll", viemChain: viemChains.scroll, alchemySlug: "scroll-mainnet", publicRpc: "https://rpc.scroll.io" },
  81457: { name: "blast", viemChain: viemChains.blast, alchemySlug: "blast-mainnet", publicRpc: "https://rpc.blast.io" },
  324: { name: "zksync", viemChain: viemChains.zksync, alchemySlug: "zksync-mainnet", publicRpc: "https://mainnet.era.zksync.io" },
  43114: { name: "avalanche", viemChain: viemChains.avalanche, alchemySlug: "avax-mainnet", publicRpc: "https://api.avax.network/ext/bc/C/rpc" },
  56: { name: "bsc", viemChain: viemChains.bsc, alchemySlug: "bnb-mainnet", publicRpc: "https://bsc-rpc.publicnode.com" },
  130: { name: "unichain", viemChain: viemChains.unichain, alchemySlug: "unichain-mainnet", publicRpc: "https://mainnet.unichain.org" },
  11155111: { name: "sepolia", viemChain: viemChains.sepolia, alchemySlug: "eth-sepolia", publicRpc: "https://ethereum-sepolia-rpc.publicnode.com" },
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
