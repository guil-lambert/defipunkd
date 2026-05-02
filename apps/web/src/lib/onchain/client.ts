/**
 * Memoized viem PublicClient per chainId.
 *
 * Uses Alchemy as the sole RPC provider for now — one key, ~10 chains. The
 * client is constructed lazily on first request to keep cold-start cheap.
 */
import { createPublicClient, http, type PublicClient } from "viem";
import { getChainEntry, type ChainEntry } from "./chains.js";

const CLIENTS = new Map<number, PublicClient>();

export class OnchainConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OnchainConfigError";
  }
}

function alchemyKey(): string {
  const k = import.meta.env.ALCHEMY_API_KEY ?? process.env.ALCHEMY_API_KEY;
  if (!k) {
    throw new OnchainConfigError(
      "ALCHEMY_API_KEY is not set. Configure it in Vercel project env (Production + Preview).",
    );
  }
  return k;
}

export interface ResolvedClient {
  client: PublicClient;
  chain: ChainEntry;
  rpcLabel: string;
}

export function getPublicClient(chainId: number): ResolvedClient {
  const entry = getChainEntry(chainId);
  if (!entry) {
    throw new OnchainConfigError(`unsupported chainId: ${chainId}`);
  }
  let client = CLIENTS.get(chainId);
  if (!client) {
    const url = `https://${entry.alchemySlug}.g.alchemy.com/v2/${alchemyKey()}`;
    client = createPublicClient({ chain: entry.viemChain, transport: http(url) });
    CLIENTS.set(chainId, client);
  }
  return { client, chain: entry, rpcLabel: `alchemy/${entry.alchemySlug}` };
}
