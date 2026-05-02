/**
 * ABI resolver: Etherscan → Sourcify fallback, with a tiny in-memory LRU and
 * automatic proxy resolution.
 *
 * For verified proxies, Etherscan's getsourcecode response carries an
 * `is_proxy` flag and an `implementation` address. When present, we recurse
 * into the implementation, then merge: implementation entries win on
 * collision, proxy admin entries (e.g. upgradeTo, admin) come along for the
 * ride. From a caller's perspective every method that an eth_call to the
 * proxy address could route to is in the merged ABI.
 *
 * Sourcify doesn't expose proxy classification, so proxies behind Sourcify-only
 * verification still return the raw proxy ABI — caller will see warnings.
 */
import {
  fetchEtherscanAbi,
  fetchEtherscanSourceCode,
  fetchSourcifyAbi,
  toChecksumAddress,
} from "@defipunkd/enrichment";
import type { Abi } from "viem";
import { canonicalAbiKey } from "./canonical.js";
import { getChainEntry } from "./chains.js";

export type AbiSource = "etherscan" | "sourcify";

export interface ProxyInfo {
  /** EIP-55 checksummed implementation address. */
  implementation: string;
  /** Where we learned this contract was a proxy. */
  source: "etherscan-sourcecode";
}

export interface ResolvedAbi {
  abi: Abi;
  source: AbiSource;
  contractName: string | null;
  /** True only when the source explicitly attests verification (Etherscan ok, Sourcify full or partial). */
  verified: boolean;
  /** Non-null when the queried address is a proxy and we resolved its implementation. */
  proxy: ProxyInfo | null;
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
  return resolveAbiInternal(chainId, address, new Set());
}

async function resolveAbiInternal(
  chainId: number,
  address: string,
  visited: Set<string>,
): Promise<ResolvedAbi> {
  const key = cacheKey(chainId, address);
  const cached = CACHE.get(key);
  if (cached) return cached;
  if (visited.has(key)) {
    // Proxy points back to itself or to an already-visited address. Treat as
    // a normal (non-proxy) contract to avoid infinite recursion.
    throw new AbiNotFoundError(
      `proxy implementation cycle detected for ${address} on chainId ${chainId}`,
      [],
    );
  }
  visited.add(key);

  const warnings: string[] = [];
  const etherscanKey = import.meta.env.ETHERSCAN_API_KEY ?? process.env.ETHERSCAN_API_KEY;
  const chainEntry = getChainEntry(chainId);

  let baseAbi: Abi | null = null;
  let baseSource: AbiSource | null = null;
  let baseContractName: string | null = null;
  let proxyImpl: string | null = null;

  if (etherscanKey && chainEntry) {
    // Fire ABI + sourcecode in parallel — same key, same chain, two
    // independent endpoints. Sourcecode tells us whether this is a proxy
    // and what the implementation address is.
    const [abiRes, sourceRes] = await Promise.all([
      fetchEtherscanAbi({
        chainId,
        address,
        apiKey: etherscanKey,
        fetch: (url) => fetch(url),
      }),
      fetchEtherscanSourceCode({
        chain: chainEntry.name,
        address,
        apiKey: etherscanKey,
        fetch: (url) => fetch(url),
      }),
    ]);
    warnings.push(...abiRes.warnings, ...sourceRes.warnings);
    if (abiRes.abi) {
      baseAbi = abiRes.abi as unknown as Abi;
      baseSource = "etherscan";
      baseContractName = sourceRes.contract?.contract_name ?? null;
      if (sourceRes.contract?.is_proxy && sourceRes.contract.implementation) {
        const impl = sourceRes.contract.implementation.toLowerCase();
        if (impl !== address.toLowerCase()) {
          proxyImpl = impl;
        }
      }
    }
  } else if (!etherscanKey) {
    warnings.push("etherscan skipped: ETHERSCAN_API_KEY not set");
  }

  if (!baseAbi) {
    // Sourcify is case-sensitive on the path.
    const checksum = toChecksumAddress(address);
    const s = await fetchSourcifyAbi({
      chainId,
      address: checksum,
      fetch: (url) => fetch(url),
    });
    warnings.push(...s.warnings);
    if (s.abi) {
      baseAbi = s.abi as unknown as Abi;
      baseSource = "sourcify";
      baseContractName = s.contractName;
      // Sourcify gives us no proxy hint — leave proxyImpl null.
    }
  }

  if (!baseAbi || !baseSource) {
    throw new AbiNotFoundError(
      `No verified ABI found for ${address} on chainId ${chainId} (etherscan + sourcify both failed).`,
      warnings,
    );
  }

  // Proxy resolution.
  let proxy: ProxyInfo | null = null;
  let mergedAbi = baseAbi;
  let mergedName = baseContractName;
  if (proxyImpl) {
    try {
      const implResolved = await resolveAbiInternal(chainId, proxyImpl, visited);
      mergedAbi = mergeAbis(implResolved.abi, baseAbi);
      // Implementation's contract name is what callers actually want — proxies
      // are usually named "FooProxy" / "TransparentUpgradeableProxy" which is
      // less useful than the underlying logic contract's name.
      mergedName = implResolved.contractName ?? baseContractName;
      proxy = {
        implementation: toChecksumAddress(proxyImpl),
        source: "etherscan-sourcecode",
      };
      warnings.push(...implResolved.warnings);
    } catch (err) {
      warnings.push(`proxy implementation resolution failed: ${(err as Error).message}`);
    }
  }

  const resolved: ResolvedAbi = {
    abi: mergedAbi,
    source: baseSource,
    contractName: mergedName,
    verified: true,
    proxy,
    warnings,
  };
  rememberAbi(key, resolved);
  return resolved;
}

/**
 * Merge implementation + proxy ABIs. Implementation wins on signature
 * collision because its functions are what actually run when the proxy
 * delegates. Proxy-only entries (admin, upgradeTo, EIP-1967 events) come
 * through unchanged.
 */
function mergeAbis(implementation: Abi, proxy: Abi): Abi {
  const seen = new Set<string>();
  const out: Abi[number][] = [];
  for (const entry of implementation) {
    out.push(entry);
    seen.add(canonicalAbiKey(entry));
  }
  for (const entry of proxy) {
    const k = canonicalAbiKey(entry);
    if (!seen.has(k)) {
      out.push(entry);
      seen.add(k);
    }
  }
  return out;
}
