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

import { toChecksumAddress } from "./checksum.js";
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
 * Why an address isn't a Safe, when we've checked.
 *   - "not_a_safe" → 404. Safe TS confirms the address is not a Safe. Doesn't
 *                     distinguish "EOA" from "non-Safe contract" — that's
 *                     determined separately via eth_getCode if needed.
 *   - "skipped"    → fetch wasn't attempted (unsupported chain, malformed
 *                     address).
 *
 * Earlier versions classified Safe TS's 422 response as `likely_eoa`, but
 * that turned out to be wrong: 422 = "checksum address validation failed",
 * raised when we send lowercase hex. Sending EIP-55-checksummed addresses
 * eliminates the 422 path entirely.
 */
export type NotSafeReason = "not_a_safe" | "skipped";

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
  // Safe TS validates EIP-55 checksum and rejects lowercase with 422.
  let checksummed: string;
  try {
    checksummed = toChecksumAddress(opts.address);
  } catch (err) {
    return {
      is_safe: false,
      not_safe_reason: "skipped",
      safe: null,
      warnings: [`safe: checksum failed: ${(err as Error).message}`],
    };
  }
  const url = `https://safe-transaction-${slug}.safe.global/api/v1/safes/${checksummed}/`;
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
    return { is_safe: false, not_safe_reason: "not_a_safe", safe: null, warnings: [] };
  }
  // Should not happen now that we send checksummed addresses, but keep a
  // defensive branch — surface the unexpected 422 as a warning rather than
  // misclassifying.
  if (res.status === 422) {
    return {
      is_safe: false,
      not_safe_reason: null,
      safe: null,
      warnings: ["safe http 422 (unexpected after checksum fix; investigate)"],
    };
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
