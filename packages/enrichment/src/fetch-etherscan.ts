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
