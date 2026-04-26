/**
 * Read `owner()` from a contract via Etherscan v2's eth_call proxy.
 *
 *   GET api.etherscan.io/v2/api
 *     ?chainid=1
 *     &module=proxy
 *     &action=eth_call
 *     &to=0x...
 *     &data=0x8da5cb5b      // selector for owner()
 *     &tag=latest
 *     &apikey=...
 *
 * Possible outcomes:
 *   - "0x000…<20-byte address>" → contract is Ownable; we extract the owner.
 *   - "0x" or empty             → no owner() function (AccessControl-only,
 *                                 immutable, etc.). We return null cleanly.
 *   - error response            → soft warning; null owner.
 *
 * This eats the same 5 req/s budget as fetch-etherscan, so callers should
 * share the same rate-limit knob.
 */

import { chainNameToId } from "./chain-id.js";
import type { FetchFn } from "./fetch-etherscan.js";

const OWNER_SELECTOR = "0x8da5cb5b";
const API_BASE = "https://api.etherscan.io/v2/api";
const ADDRESS_PADDED_RE = /^0x[a-fA-F0-9]{64}$/;

export interface OwnerFetchResult {
  /** Address that `owner()` returned, lowercased. Null when the contract
   *  has no owner function or the call reverted. */
  owner: string | null;
  warnings: string[];
}

export interface FetchOwnerOptions {
  chain: string;
  address: string;
  apiKey: string;
  fetch: FetchFn;
}

interface EthCallResponse {
  jsonrpc?: string;
  id?: number;
  result?: string;
  error?: { code?: number; message?: string };
  status?: string;
  message?: string;
}

/** Strip a 32-byte returndata word to its lower 20 bytes (an EVM address). */
function paddedToAddress(padded: string): string | null {
  if (!ADDRESS_PADDED_RE.test(padded)) return null;
  const trimmed = `0x${padded.slice(-40)}`.toLowerCase();
  // The zero address signals "no owner" (e.g. renounced).
  if (trimmed === "0x0000000000000000000000000000000000000000") return null;
  return trimmed;
}

export async function fetchOwner(opts: FetchOwnerOptions): Promise<OwnerFetchResult> {
  const chainId = chainNameToId(opts.chain);
  if (chainId === null) {
    return { owner: null, warnings: [`unsupported chain: ${opts.chain}`] };
  }
  const url =
    `${API_BASE}?chainid=${chainId}` +
    `&module=proxy&action=eth_call` +
    `&to=${opts.address}` +
    `&data=${OWNER_SELECTOR}` +
    `&tag=latest` +
    `&apikey=${encodeURIComponent(opts.apiKey)}`;
  let res: Awaited<ReturnType<FetchFn>>;
  try {
    res = await opts.fetch(url);
  } catch (err) {
    return { owner: null, warnings: [`owner fetch failed: ${(err as Error).message}`] };
  }
  if (!res.ok) {
    return { owner: null, warnings: [`owner http ${res.status}`] };
  }
  let body: EthCallResponse;
  try {
    body = (await res.json()) as EthCallResponse;
  } catch (err) {
    return { owner: null, warnings: [`owner non-json response: ${(err as Error).message}`] };
  }

  // Etherscan can wrap eth_call results in either jsonrpc or status form.
  if (body.error) {
    // "execution reverted" = no owner() function; not a real error.
    if (/execution reverted|invalid opcode|out of gas/i.test(body.error.message ?? "")) {
      return { owner: null, warnings: [] };
    }
    return { owner: null, warnings: [`owner eth_call error: ${body.error.message ?? "unknown"}`] };
  }
  if (body.status === "0") {
    // Some chains return status=0 + result containing an error string.
    const msg = typeof body.result === "string" ? body.result : (body.message ?? "unknown");
    if (/execution reverted|invalid opcode|no contract code/i.test(msg)) {
      return { owner: null, warnings: [] };
    }
    return { owner: null, warnings: [`owner status=0: ${msg}`] };
  }

  const raw = body.result;
  if (typeof raw !== "string" || raw === "0x" || raw.length === 0) {
    return { owner: null, warnings: [] };
  }
  const addr = paddedToAddress(raw);
  if (!addr) {
    // The call returned data but it doesn't decode as an address — likely the
    // contract has a different owner-shaped function (renounced + zero-padded,
    // or returns a value type, etc.).
    return { owner: null, warnings: [] };
  }
  return { owner: addr, warnings: [] };
}
