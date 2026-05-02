/**
 * Etherscan v2 multichain client.
 *
 * One API key works across 60+ EVM chains via the `chainid` query parameter.
 * Free-tier limits: 5 calls/sec, 100K calls/day.
 *
 * We only need two actions:
 *   - module=contract  action=getsourcecode  → verified flag, name, compiler,
 *                                              proxy + implementation.
 *   - (optional, future) module=proxy action=eth_getStorageAt for raw slot reads.
 *
 * Public surface returns plain "result" objects; networking errors and
 * rate-limit "NOTOK" responses become structured errors so the caller can
 * record them as warnings instead of aborting.
 */

import { chainNameToId } from "./chain-id.js";

const API_BASE = "https://api.etherscan.io/v2/api";

export interface EtherscanContract {
  /** True when Etherscan reports a non-empty SourceCode field. */
  verified: boolean;
  /** Human-readable contract name from the explorer (e.g. "Lido"). */
  contract_name: string | null;
  /** Compiler version string (e.g. "v0.8.20+commit.a1b79de6"). */
  compiler: string | null;
  /** True when OptimizationUsed flag is set. */
  optimization: boolean;
  /** True when Etherscan classifies this address as a proxy. */
  is_proxy: boolean;
  /** Implementation address when Etherscan resolves one (proxy targets). */
  implementation: string | null;
}

export interface EtherscanFetchResult {
  contract: EtherscanContract | null;
  /** Soft errors / warnings from the Etherscan response (e.g. rate-limit messages). */
  warnings: string[];
}

export type FetchFn = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

interface GetSourceCodeRow {
  SourceCode?: string;
  ContractName?: string;
  CompilerVersion?: string;
  OptimizationUsed?: string;
  Proxy?: string;
  Implementation?: string;
}

interface GetSourceCodeResponse {
  status?: string;
  message?: string;
  result?: GetSourceCodeRow[] | string;
}

function parseRow(row: GetSourceCodeRow): EtherscanContract {
  const sourceCode = row.SourceCode ?? "";
  const verified = sourceCode.length > 0;
  const proxyFlag = row.Proxy === "1";
  const impl = row.Implementation ?? "";
  return {
    verified,
    contract_name: row.ContractName?.trim() ? (row.ContractName?.trim() ?? null) : null,
    compiler: row.CompilerVersion?.trim() ? (row.CompilerVersion?.trim() ?? null) : null,
    optimization: row.OptimizationUsed === "1",
    is_proxy: proxyFlag,
    implementation: impl && /^0x[a-fA-F0-9]{40}$/.test(impl) ? impl.toLowerCase() : null,
  };
}

export interface FetchSourceCodeOptions {
  chain: string;
  address: string;
  apiKey: string;
  fetch: FetchFn;
}

export async function fetchEtherscanSourceCode(
  opts: FetchSourceCodeOptions,
): Promise<EtherscanFetchResult> {
  const chainId = chainNameToId(opts.chain);
  if (chainId === null) {
    return { contract: null, warnings: [`unsupported chain: ${opts.chain}`] };
  }
  const url =
    `${API_BASE}?chainid=${chainId}` +
    `&module=contract&action=getsourcecode` +
    `&address=${opts.address}` +
    `&apikey=${encodeURIComponent(opts.apiKey)}`;
  let res: Awaited<ReturnType<FetchFn>>;
  try {
    res = await opts.fetch(url);
  } catch (err) {
    return { contract: null, warnings: [`etherscan fetch failed: ${(err as Error).message}`] };
  }
  if (!res.ok) {
    return { contract: null, warnings: [`etherscan http ${res.status}`] };
  }
  let body: GetSourceCodeResponse;
  try {
    body = (await res.json()) as GetSourceCodeResponse;
  } catch (err) {
    return { contract: null, warnings: [`etherscan non-json response: ${(err as Error).message}`] };
  }
  if (body.status !== "1") {
    const msg = typeof body.result === "string" ? body.result : (body.message ?? "unknown error");
    // Etherscan returns status="0" with message="No records found" for unverified contracts.
    // Treat those as a successful "not verified" rather than an error.
    if (/no records|not verified/i.test(msg)) {
      return {
        contract: {
          verified: false,
          contract_name: null,
          compiler: null,
          optimization: false,
          is_proxy: false,
          implementation: null,
        },
        warnings: [],
      };
    }
    return { contract: null, warnings: [`etherscan status=${body.status}: ${msg}`] };
  }
  if (!Array.isArray(body.result) || body.result.length === 0) {
    return { contract: null, warnings: ["etherscan empty result array"] };
  }
  return { contract: parseRow(body.result[0]!), warnings: [] };
}

// ---------------------------------------------------------------------------
// ABI fetcher (module=contract&action=getabi)
//
// Used by the read API to encode/decode arbitrary view calls. Distinct from
// fetchEtherscanSourceCode above because it takes a numeric chainId directly
// (the read API receives ?chainId=1 in its query string and skips the
// name→id translation).

export type EtherscanAbi = ReadonlyArray<Record<string, unknown>>;

export interface EtherscanAbiResult {
  abi: EtherscanAbi | null;
  /** True when Etherscan responded "Contract source code not verified". */
  unverified: boolean;
  warnings: string[];
}

export interface FetchAbiOptions {
  chainId: number;
  address: string;
  apiKey: string;
  fetch: FetchFn;
}

interface GetAbiResponse {
  status?: string;
  message?: string;
  result?: string;
}

export async function fetchEtherscanAbi(opts: FetchAbiOptions): Promise<EtherscanAbiResult> {
  const url =
    `${API_BASE}?chainid=${opts.chainId}` +
    `&module=contract&action=getabi` +
    `&address=${opts.address}` +
    `&apikey=${encodeURIComponent(opts.apiKey)}`;
  let res: Awaited<ReturnType<FetchFn>>;
  try {
    res = await opts.fetch(url);
  } catch (err) {
    return { abi: null, unverified: false, warnings: [`etherscan fetch failed: ${(err as Error).message}`] };
  }
  if (!res.ok) {
    return { abi: null, unverified: false, warnings: [`etherscan http ${res.status}`] };
  }
  let body: GetAbiResponse;
  try {
    body = (await res.json()) as GetAbiResponse;
  } catch (err) {
    return { abi: null, unverified: false, warnings: [`etherscan non-json response: ${(err as Error).message}`] };
  }
  // Etherscan signals "no ABI" with status="0" and result="Contract source
  // code not verified". Surface that distinctly so callers can fall back to
  // Sourcify without treating it as a hard error.
  if (body.status !== "1") {
    const msg = typeof body.result === "string" ? body.result : (body.message ?? "unknown error");
    if (/not verified|no records/i.test(msg)) {
      return { abi: null, unverified: true, warnings: [] };
    }
    return { abi: null, unverified: false, warnings: [`etherscan status=${body.status}: ${msg}`] };
  }
  if (typeof body.result !== "string") {
    return { abi: null, unverified: false, warnings: ["etherscan abi result not a string"] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.result);
  } catch (err) {
    return { abi: null, unverified: false, warnings: [`etherscan abi parse failed: ${(err as Error).message}`] };
  }
  if (!Array.isArray(parsed)) {
    return { abi: null, unverified: false, warnings: ["etherscan abi not an array"] };
  }
  return { abi: parsed as EtherscanAbi, unverified: false, warnings: [] };
}
