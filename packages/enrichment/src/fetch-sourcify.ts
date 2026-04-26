/**
 * Sourcify cross-check client.
 *
 * Independent verification source: returns "perfect", "partial", or "false".
 * - perfect = exact bytecode + metadata match
 * - partial = bytecode match but metadata (e.g. comments) differ
 * - false   = no verification on file
 *
 * No API key required.
 *
 * Reference: https://docs.sourcify.dev/docs/api/server/check-by-addresses/
 */

import { chainNameToId } from "./chain-id.js";
import type { FetchFn } from "./fetch-etherscan.js";

const API_BASE = "https://sourcify.dev/server/check-by-addresses";

export type SourcifyStatus = "perfect" | "partial" | "false";

export interface SourcifyFetchResult {
  status: SourcifyStatus | null;
  warnings: string[];
}

interface SourcifyRow {
  address?: string;
  status?: string;
  chainIds?: Array<string | number>;
}

export interface FetchSourcifyOptions {
  chain: string;
  address: string;
  fetch: FetchFn;
}

export async function fetchSourcify(
  opts: FetchSourcifyOptions,
): Promise<SourcifyFetchResult> {
  const chainId = chainNameToId(opts.chain);
  if (chainId === null) {
    return { status: null, warnings: [`unsupported chain: ${opts.chain}`] };
  }
  const url = `${API_BASE}?addresses=${opts.address}&chainIds=${chainId}`;
  let res: Awaited<ReturnType<FetchFn>>;
  try {
    res = await opts.fetch(url);
  } catch (err) {
    return { status: null, warnings: [`sourcify fetch failed: ${(err as Error).message}`] };
  }
  if (!res.ok) {
    return { status: null, warnings: [`sourcify http ${res.status}`] };
  }
  let body: SourcifyRow[];
  try {
    body = (await res.json()) as SourcifyRow[];
  } catch (err) {
    return { status: null, warnings: [`sourcify non-json response: ${(err as Error).message}`] };
  }
  if (!Array.isArray(body) || body.length === 0) {
    return { status: null, warnings: ["sourcify empty result"] };
  }
  const row = body[0]!;
  const raw = (row.status ?? "").toLowerCase();
  if (raw === "perfect" || raw === "partial" || raw === "false") {
    return { status: raw, warnings: [] };
  }
  return { status: null, warnings: [`sourcify unknown status: ${row.status ?? "<missing>"}`] };
}
