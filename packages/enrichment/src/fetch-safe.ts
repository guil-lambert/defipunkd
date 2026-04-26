/**
 * Safe Transaction Service client.
 *
 * Hits `safe-transaction-{slug}.safe.global/api/v1/safes/{address}/`.
 *   - 200 → the address is a Safe; payload includes owners + threshold.
 *   - 404 → the address exists on-chain but is not a Safe (or never was).
 *   - other → soft error recorded as a warning.
 *
 * No API key required. Rate-limit guidance is "be reasonable"; we throttle
 * the same as the Etherscan path so the CLI stays inside both budgets with
 * one knob.
 *
 * Reference: https://docs.safe.global/core-api/api-services/safe-transaction-service
 */

import type { FetchFn } from "./fetch-etherscan.js";
import { chainNameToSafeSlug } from "./safe-chain-id.js";

export interface SafeMetadata {
  /** Threshold N in N-of-M. */
  threshold: number;
  /** Number of owners. */
  owners_count: number;
  /** Owner addresses, lowercased. */
  owners: string[];
  /** Safe contract version, e.g. "1.4.1". */
  version: string | null;
  /** Number of installed Safe modules (Guard, Recovery, Allowance, etc.). */
  modules_count: number;
}

/**
 * Why an address isn't a Safe, when we've checked. The Safe TS response code
 * gives us a useful structural distinction:
 *   - "not_indexed"  → 404. Address has contract code but isn't a Safe (or
 *                       isn't yet indexed). Could be a Timelock, a custom
 *                       multisig, an admin contract, anything.
 *   - "likely_eoa"   → 422. Safe TS rejected the address as not-a-contract,
 *                       which strongly implies it's an externally-owned
 *                       account — a single private key. Worst-case for the
 *                       control slice: a TVL contract owned by an EOA has
 *                       no operational threshold and no key recovery.
 *   - "skipped"      → fetch wasn't attempted (unsupported chain, malformed
 *                       address).
 */
export type NotSafeReason = "not_indexed" | "likely_eoa" | "skipped";

export interface SafeFetchResult {
  is_safe: boolean;
  /** Set when is_safe is false. Null otherwise. */
  not_safe_reason: NotSafeReason | null;
  safe: SafeMetadata | null;
  warnings: string[];
}

export interface FetchSafeOptions {
  chain: string;
  address: string;
  fetch: FetchFn;
}

interface SafeApiResponse {
  address?: string;
  threshold?: number;
  owners?: string[];
  version?: string;
  modules?: unknown[];
}

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export async function fetchSafe(opts: FetchSafeOptions): Promise<SafeFetchResult> {
  const slug = chainNameToSafeSlug(opts.chain);
  if (slug === null) {
    return {
      is_safe: false,
      not_safe_reason: "skipped",
      safe: null,
      warnings: [`safe: unsupported chain "${opts.chain}"`],
    };
  }
  if (!ADDRESS_RE.test(opts.address)) {
    return {
      is_safe: false,
      not_safe_reason: "skipped",
      safe: null,
      warnings: [`safe: malformed address "${opts.address}"`],
    };
  }
  const url = `https://safe-transaction-${slug}.safe.global/api/v1/safes/${opts.address}/`;
  let res: Awaited<ReturnType<FetchFn>>;
  try {
    res = await opts.fetch(url);
  } catch (err) {
    return {
      is_safe: false,
      not_safe_reason: null,
      safe: null,
      warnings: [`safe fetch failed: ${(err as Error).message}`],
    };
  }
  if (res.status === 404) {
    return { is_safe: false, not_safe_reason: "not_indexed", safe: null, warnings: [] };
  }
  if (res.status === 422) {
    // Safe TS rejects non-contract addresses with 422. This is structural,
    // not an error — the address is most likely an EOA (single private key).
    return { is_safe: false, not_safe_reason: "likely_eoa", safe: null, warnings: [] };
  }
  if (!res.ok) {
    return { is_safe: false, not_safe_reason: null, safe: null, warnings: [`safe http ${res.status}`] };
  }
  let body: SafeApiResponse;
  try {
    body = (await res.json()) as SafeApiResponse;
  } catch (err) {
    return {
      is_safe: false,
      not_safe_reason: null,
      safe: null,
      warnings: [`safe non-json response: ${(err as Error).message}`],
    };
  }
  if (typeof body.threshold !== "number" || !Array.isArray(body.owners)) {
    return {
      is_safe: false,
      not_safe_reason: null,
      safe: null,
      warnings: ["safe: malformed payload"],
    };
  }
  const owners = body.owners.filter((o): o is string => typeof o === "string").map((o) => o.toLowerCase());
  return {
    is_safe: true,
    not_safe_reason: null,
    safe: {
      threshold: body.threshold,
      owners_count: owners.length,
      owners,
      version: body.version ?? null,
      modules_count: Array.isArray(body.modules) ? body.modules.length : 0,
    },
    warnings: [],
  };
}
