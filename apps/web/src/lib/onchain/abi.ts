/**
 * ABI resolver: Etherscan → Sourcify fallback, with a tiny in-memory LRU.
 *
 * ABIs for verified contracts are effectively immutable, so we cache aggressively
 * within the serverless function instance. Vercel's edge cache (Cache-Control)
 * handles cross-request reuse.
 */
import { fetchEtherscanAbi, fetchSourcifyAbi, toChecksumAddress } from "@defipunkd/enrichment";
import type { Abi } from "viem";

export type AbiSource = "etherscan" | "sourcify";

export interface ResolvedAbi {
  abi: Abi;
  source: AbiSource;
  contractName: string | null;
  /** True only when the source explicitly attests verification (Etherscan ok, Sourcify full or partial). */
  verified: boolean;
  warnings: string[];
}

const CACHE = new Map<string, ResolvedAbi>();
const CACHE_MAX = 256;

function cacheKey(chainId: number, address: string): string {
  return `${chainId}:${address.toLowerCase()}`;
}

function rememberAbi(key: string, value: ResolvedAbi): void {
  if (CACHE.size >= CACHE_MAX) {
    // Drop the oldest insertion. Map iteration is insertion-ordered.
    const first = CACHE.keys().next().value;
    if (first !== undefined) CACHE.delete(first);
  }
  CACHE.set(key, value);
}

export class AbiNotFoundError extends Error {
  warnings: string[];
  constructor(message: string, warnings: string[]) {
    super(message);
    this.name = "AbiNotFoundError";
    this.warnings = warnings;
  }
}

export async function resolveAbi(chainId: number, address: string): Promise<ResolvedAbi> {
  const key = cacheKey(chainId, address);
  const cached = CACHE.get(key);
  if (cached) return cached;

  const warnings: string[] = [];
  const etherscanKey = import.meta.env.ETHERSCAN_API_KEY ?? process.env.ETHERSCAN_API_KEY;

  if (etherscanKey) {
    const r = await fetchEtherscanAbi({
      chainId,
      address,
      apiKey: etherscanKey,
      fetch: (url) => fetch(url),
    });
    warnings.push(...r.warnings);
    if (r.abi) {
      const resolved: ResolvedAbi = {
        abi: r.abi as unknown as Abi,
        source: "etherscan",
        contractName: null,
        verified: true,
        warnings,
      };
      rememberAbi(key, resolved);
      return resolved;
    }
  } else {
    warnings.push("etherscan skipped: ETHERSCAN_API_KEY not set");
  }

  // Sourcify is case-sensitive on the path.
  const checksum = toChecksumAddress(address);
  const s = await fetchSourcifyAbi({
    chainId,
    address: checksum,
    fetch: (url) => fetch(url),
  });
  warnings.push(...s.warnings);
  if (s.abi) {
    const resolved: ResolvedAbi = {
      abi: s.abi as unknown as Abi,
      source: "sourcify",
      contractName: s.contractName,
      verified: true,
      warnings,
    };
    rememberAbi(key, resolved);
    return resolved;
  }

  throw new AbiNotFoundError(
    `No verified ABI found for ${checksum} on chainId ${chainId} (etherscan + sourcify both failed).`,
    warnings,
  );
}
