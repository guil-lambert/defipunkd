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

// ---------------------------------------------------------------------------
// ABI fetcher.
//
// Sourcify exposes the full Solidity metadata.json under
//   /contracts/{full_match,partial_match}/{chainId}/{checksumAddress}/metadata.json
// We try full_match first (exact bytecode + metadata), fall back to
// partial_match. The ABI lives at output.abi inside the metadata file.

const REPO_BASE = "https://repo.sourcify.dev/contracts";

export type SourcifyMatch = "full_match" | "partial_match";

export type SourcifyAbi = ReadonlyArray<Record<string, unknown>>;

export interface SourcifyAbiResult {
  abi: SourcifyAbi | null;
  match: SourcifyMatch | null;
  contractName: string | null;
  warnings: string[];
}

export interface FetchSourcifyAbiOptions {
  chainId: number;
  /** EIP-55 checksummed address (Sourcify's CDN is case-sensitive). */
  address: string;
  fetch: FetchFn;
}

interface SourcifyMetadata {
  output?: { abi?: unknown };
  settings?: { compilationTarget?: Record<string, string> };
}

async function tryMatch(
  match: SourcifyMatch,
  opts: FetchSourcifyAbiOptions,
): Promise<{ abi: SourcifyAbi | null; contractName: string | null; warning: string | null }> {
  const url = `${REPO_BASE}/${match}/${opts.chainId}/${opts.address}/metadata.json`;
  let res: Awaited<ReturnType<FetchFn>>;
  try {
    res = await opts.fetch(url);
  } catch (err) {
    return { abi: null, contractName: null, warning: `sourcify ${match} fetch failed: ${(err as Error).message}` };
  }
  if (res.status === 404) {
    return { abi: null, contractName: null, warning: null };
  }
  if (!res.ok) {
    return { abi: null, contractName: null, warning: `sourcify ${match} http ${res.status}` };
  }
  let body: SourcifyMetadata;
  try {
    body = (await res.json()) as SourcifyMetadata;
  } catch (err) {
    return { abi: null, contractName: null, warning: `sourcify ${match} non-json: ${(err as Error).message}` };
  }
  const abi = body.output?.abi;
  if (!Array.isArray(abi)) {
    return { abi: null, contractName: null, warning: `sourcify ${match} missing output.abi` };
  }
  // compilationTarget maps source-file path → contract name; we just want the
  // primary contract name for the summary.
  const targets = body.settings?.compilationTarget ?? {};
  const contractName = Object.values(targets)[0] ?? null;
  return { abi: abi as SourcifyAbi, contractName, warning: null };
}

export async function fetchSourcifyAbi(opts: FetchSourcifyAbiOptions): Promise<SourcifyAbiResult> {
  const warnings: string[] = [];
  for (const match of ["full_match", "partial_match"] as const) {
    const r = await tryMatch(match, opts);
    if (r.warning) warnings.push(r.warning);
    if (r.abi) {
      return { abi: r.abi, match, contractName: r.contractName, warnings };
    }
  }
  return { abi: null, match: null, contractName: null, warnings };
}
