#!/usr/bin/env node
/**
 * defipunkd-fetch-sourcecode
 *
 * Reads each `data/enrichment/<slug>/adapter.json` produced by PR 2/2.5,
 * walks every (chain, address) tuple, hits Etherscan v2 + Sourcify, and
 * writes `data/enrichment/<slug>/sourcecode.json` with verified-source flags,
 * contract names, compiler info, and proxy/implementation metadata.
 *
 * Usage:
 *   ETHERSCAN_API_KEY=... pnpm --filter @defipunkd/enrichment exec \
 *     tsx src/cli/fetch-sourcecode.ts                              # all slugs
 *
 *   pnpm --filter @defipunkd/enrichment exec \
 *     tsx src/cli/fetch-sourcecode.ts --slug lido                  # one slug
 *
 * Environment:
 *   ETHERSCAN_API_KEY        Required for Etherscan calls. If absent, only
 *                            Sourcify is queried (still produces useful output).
 *   DEFIPUNKD_REPO_ROOT      Override repo root.
 *   FETCH_RATE_LIMIT_MS      Inter-request delay (default 250ms ≈ 4 req/s,
 *                            under Etherscan's 5/s free-tier ceiling).
 *   FETCH_LIMIT              Cap on (chain,address) tuples processed this run.
 *                            Useful for incremental backfills.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isSupportedChain } from "../chain-id.js";
import {
  fetchEtherscanSourceCode,
  type EtherscanContract,
  type FetchFn,
} from "../fetch-etherscan.js";
import { fetchSourcify, type SourcifyStatus } from "../fetch-sourcify.js";

interface CliOptions {
  slug: string | null;
  repoRoot: string;
  apiKey: string | null;
  rateLimitMs: number;
  limit: number | null;
}

interface AdapterFile {
  slug: string;
  adapter_commit?: string;
  unresolved?: boolean;
  static_addresses: Array<{
    chain: string | null;
    address: string;
    context: string | null;
    purpose_hint?: string;
  }>;
}

interface SourceCodeAddress {
  chain: string;
  address: string;
  context: string | null;
  etherscan: {
    fetched: boolean;
    verified: boolean;
    contract_name: string | null;
    compiler: string | null;
    optimization: boolean;
    is_proxy: boolean;
    implementation: string | null;
  } | null;
  sourcify: {
    fetched: boolean;
    status: SourcifyStatus | null;
  } | null;
  warnings: string[];
}

interface SourceCodeFile {
  slug: string;
  adapter_commit: string | null;
  fetched_at: string;
  etherscan_v: "v2" | null;
  addresses: SourceCodeAddress[];
  summary: {
    total: number;
    verified_etherscan: number;
    verified_sourcify: number;
    proxies: number;
    skipped_unsupported_chain: number;
    skipped_etherscan: number;
  };
}

function findRepoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function parseArgs(argv: string[]): CliOptions {
  let slug: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--slug") slug = argv[++i] ?? null;
    else if (a?.startsWith("--slug=")) slug = a.slice("--slug=".length);
  }
  const apiKey = process.env.ETHERSCAN_API_KEY?.trim() || null;
  const rateLimitMs = Number(process.env.FETCH_RATE_LIMIT_MS ?? "250");
  const rawLimit = process.env.FETCH_LIMIT;
  return {
    slug,
    repoRoot: resolve(process.env.DEFIPUNKD_REPO_ROOT ?? findRepoRoot()),
    apiKey,
    rateLimitMs: Number.isFinite(rateLimitMs) && rateLimitMs >= 0 ? rateLimitMs : 250,
    limit: rawLimit ? Number(rawLimit) : null,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const fetchFn: FetchFn = async (url: string) => {
  const res = await fetch(url);
  return {
    ok: res.ok,
    status: res.status,
    json: () => res.json() as Promise<unknown>,
  };
};

function listAdapterFiles(repoRoot: string): string[] {
  const root = join(repoRoot, "data", "enrichment");
  if (!existsSync(root)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const adapterPath = join(root, entry.name, "adapter.json");
    if (existsSync(adapterPath)) out.push(adapterPath);
  }
  return out.sort();
}

function loadAdapter(path: string): AdapterFile | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as AdapterFile;
  } catch {
    return null;
  }
}

function key(chain: string, address: string): string {
  return `${chain}|${address.toLowerCase()}`;
}

interface FetchedEntry {
  etherscan: {
    fetched: boolean;
    contract: EtherscanContract | null;
    warnings: string[];
  };
  sourcify: {
    fetched: boolean;
    status: SourcifyStatus | null;
    warnings: string[];
  };
}

async function fetchOneAddress(
  chain: string,
  address: string,
  apiKey: string | null,
  rateLimitMs: number,
): Promise<FetchedEntry> {
  const result: FetchedEntry = {
    etherscan: { fetched: false, contract: null, warnings: [] },
    sourcify: { fetched: false, status: null, warnings: [] },
  };

  // Etherscan first when we have a key — proxy/impl info is the most useful.
  if (apiKey) {
    const r = await fetchEtherscanSourceCode({ chain, address, apiKey, fetch: fetchFn });
    result.etherscan.fetched = true;
    result.etherscan.contract = r.contract;
    result.etherscan.warnings = r.warnings;
    if (rateLimitMs > 0) await sleep(rateLimitMs);
  }

  const s = await fetchSourcify({ chain, address, fetch: fetchFn });
  result.sourcify.fetched = true;
  result.sourcify.status = s.status;
  result.sourcify.warnings = s.warnings;
  if (rateLimitMs > 0) await sleep(rateLimitMs);

  return result;
}

function buildAddressEntry(
  chain: string,
  address: string,
  context: string | null,
  fetched: FetchedEntry | null,
  apiKey: string | null,
): SourceCodeAddress {
  const warnings: string[] = [];
  let etherscan: SourceCodeAddress["etherscan"] = null;
  let sourcify: SourceCodeAddress["sourcify"] = null;

  if (!isSupportedChain(chain)) {
    warnings.push(`skipped: chain "${chain}" not supported by Etherscan v2 / Sourcify mapping`);
  }

  if (fetched) {
    if (fetched.etherscan.fetched) {
      const c = fetched.etherscan.contract;
      etherscan = c
        ? { fetched: true, ...c }
        : {
            fetched: true,
            verified: false,
            contract_name: null,
            compiler: null,
            optimization: false,
            is_proxy: false,
            implementation: null,
          };
      warnings.push(...fetched.etherscan.warnings);
    } else if (apiKey === null) {
      warnings.push("etherscan skipped: ETHERSCAN_API_KEY not set");
    }

    if (fetched.sourcify.fetched) {
      sourcify = { fetched: true, status: fetched.sourcify.status };
      warnings.push(...fetched.sourcify.warnings);
    }
  }

  return { chain, address, context, etherscan, sourcify, warnings };
}

function summarize(entries: SourceCodeAddress[]): SourceCodeFile["summary"] {
  let verifiedEth = 0;
  let verifiedSourcify = 0;
  let proxies = 0;
  let skippedChain = 0;
  let skippedEth = 0;
  for (const e of entries) {
    if (e.etherscan?.verified) verifiedEth++;
    if (e.etherscan?.is_proxy) proxies++;
    if (e.sourcify?.status && e.sourcify.status !== "false") verifiedSourcify++;
    if (e.warnings.some((w) => w.startsWith("skipped: chain"))) skippedChain++;
    if (e.warnings.some((w) => w.startsWith("etherscan skipped:"))) skippedEth++;
  }
  return {
    total: entries.length,
    verified_etherscan: verifiedEth,
    verified_sourcify: verifiedSourcify,
    proxies,
    skipped_unsupported_chain: skippedChain,
    skipped_etherscan: skippedEth,
  };
}

function writeSourceCode(
  repoRoot: string,
  slug: string,
  file: SourceCodeFile,
): void {
  const outDir = join(repoRoot, "data", "enrichment", slug);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "sourcecode.json"), `${JSON.stringify(file, null, 2)}\n`);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  if (!opts.apiKey) {
    console.error(
      "[sourcecode] ETHERSCAN_API_KEY not set — running Sourcify-only mode",
    );
  }

  const adapterPaths = listAdapterFiles(opts.repoRoot);
  const filtered = opts.slug
    ? adapterPaths.filter((p) => p.includes(`/${opts.slug}/`))
    : adapterPaths;

  if (filtered.length === 0) {
    console.error(`[sourcecode] no adapter.json files matched (slug=${opts.slug ?? "(all)"})`);
    process.exit(1);
  }

  console.error(`[sourcecode] processing ${filtered.length} adapter files`);

  // Cross-protocol dedup: many protocols share token addresses (USDC, WETH).
  const fetchedCache = new Map<string, FetchedEntry>();
  let calls = 0;

  for (const adapterPath of filtered) {
    const adapter = loadAdapter(adapterPath);
    if (!adapter) continue;

    const seen = new Set<string>();
    const entries: SourceCodeAddress[] = [];

    for (const a of adapter.static_addresses) {
      if (!a.chain) continue; // chain attribution is required for any explorer call
      const k = key(a.chain, a.address);
      if (seen.has(k)) continue;
      seen.add(k);

      let fetched = fetchedCache.get(k) ?? null;
      if (!fetched && isSupportedChain(a.chain)) {
        if (opts.limit !== null && calls >= opts.limit) {
          // Limit hit — emit unfetched record.
          entries.push(buildAddressEntry(a.chain, a.address, a.context, null, opts.apiKey));
          continue;
        }
        fetched = await fetchOneAddress(a.chain, a.address, opts.apiKey, opts.rateLimitMs);
        fetchedCache.set(k, fetched);
        calls++;
      }
      entries.push(buildAddressEntry(a.chain, a.address, a.context, fetched, opts.apiKey));
    }

    entries.sort((x, y) => {
      if (x.chain !== y.chain) return x.chain.localeCompare(y.chain);
      return x.address.localeCompare(y.address);
    });

    const out: SourceCodeFile = {
      slug: adapter.slug,
      adapter_commit: adapter.adapter_commit ?? null,
      fetched_at: new Date().toISOString(),
      etherscan_v: opts.apiKey ? "v2" : null,
      addresses: entries,
      summary: summarize(entries),
    };
    writeSourceCode(opts.repoRoot, adapter.slug, out);
  }

  console.error(
    `[sourcecode] done: ${calls} unique address fetches across ${filtered.length} protocols`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
