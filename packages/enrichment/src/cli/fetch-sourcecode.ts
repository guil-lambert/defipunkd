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
 *   ETHERSCAN_API_KEY=... FETCH_LIMIT=2000 pnpm ... fetch-sourcecode.ts
 *     # Cap this run at 2000 fresh fetches; resume tomorrow without losing
 *     # the work already done — existing sourcecode.json files seed the
 *     # in-memory cache on every startup.
 *
 * Resume across runs:
 *   The CLI loads every existing data/enrichment/<slug>/sourcecode.json on
 *   startup and reuses (chain, address) records that have a successful
 *   fetched flag. Use --force-refetch to bypass and start fresh.
 *
 * Environment:
 *   ETHERSCAN_API_KEY        Required for Etherscan calls. If absent, only
 *                            Sourcify is queried (still produces useful output).
 *   DEFIPUNKD_REPO_ROOT      Override repo root.
 *   FETCH_RATE_LIMIT_MS      Inter-request delay (default 250ms ≈ 4 req/s,
 *                            under Etherscan's 5/s free-tier ceiling).
 *   FETCH_LIMIT              Cap on FRESH (chain,address) fetches this run.
 *                            Cache hits don't count against the budget.
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
  forceRefetch: boolean;
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
  let forceRefetch = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--slug") slug = argv[++i] ?? null;
    else if (a?.startsWith("--slug=")) slug = a.slice("--slug=".length);
    else if (a === "--force-refetch") forceRefetch = true;
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
    forceRefetch,
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

/**
 * Decide whether a previously-fetched record is "good enough" to reuse.
 * - If apiKey is set: require both etherscan AND sourcify to have been
 *   fetched, AND etherscan must not have soft-failure warnings.
 * - If apiKey is not set: only sourcify needs to have been fetched.
 *
 * `verified=false` IS reusable — that's a real answer, not an error.
 */
function isCacheable(entry: SourceCodeAddress, hasApiKey: boolean): boolean {
  const fatalEtherscan = (entry.warnings ?? []).some(
    (w) => w.startsWith("etherscan ") && !w.startsWith("etherscan skipped:"),
  );
  if (fatalEtherscan) return false;
  const ethOk = hasApiKey ? entry.etherscan?.fetched === true : true;
  const sourcifyOk = entry.sourcify?.fetched === true;
  return ethOk && sourcifyOk;
}

/**
 * Walk every existing sourcecode.json and seed the in-memory cache so
 * incremental runs (capped via FETCH_LIMIT, or interrupted runs) don't
 * re-fetch addresses we already have answers for.
 *
 * Cross-protocol: many slugs cite the same USDC/WETH/etc., so a hit on one
 * protocol's record is reusable everywhere.
 */
function loadFetchedCache(
  repoRoot: string,
  hasApiKey: boolean,
): Map<string, FetchedEntry> {
  const cache = new Map<string, FetchedEntry>();
  const root = join(repoRoot, "data", "enrichment");
  if (!existsSync(root)) return cache;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(root, entry.name, "sourcecode.json");
    if (!existsSync(path)) continue;
    let file: SourceCodeFile;
    try {
      file = JSON.parse(readFileSync(path, "utf8")) as SourceCodeFile;
    } catch {
      continue;
    }
    for (const addr of file.addresses) {
      if (!isCacheable(addr, hasApiKey)) continue;
      const k = key(addr.chain, addr.address);
      if (cache.has(k)) continue;
      cache.set(k, {
        etherscan: {
          fetched: addr.etherscan?.fetched ?? false,
          contract: addr.etherscan
            ? {
                verified: addr.etherscan.verified,
                contract_name: addr.etherscan.contract_name,
                compiler: addr.etherscan.compiler,
                optimization: addr.etherscan.optimization,
                is_proxy: addr.etherscan.is_proxy,
                implementation: addr.etherscan.implementation,
              }
            : null,
          warnings: [],
        },
        sourcify: {
          fetched: addr.sourcify?.fetched ?? false,
          status: addr.sourcify?.status ?? null,
          warnings: [],
        },
      });
    }
  }
  return cache;
}

function loadAdapter(path: string): AdapterFile | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as AdapterFile;
  } catch {
    return null;
  }
}

interface DiscoveryAddress {
  chain: string;
  address: string;
  context: string | null;
}

/**
 * Walk every data/submissions/<slug>/discovery/*.json and return the union
 * of (chain, address) tuples discovered there: protocol_metadata
 * .admin_addresses (the structured catalogue, typically the bulk) plus any
 * evidence[] rows that carry both chain and address. Without this pass, the
 * sourcecode pipeline only verifies DefiLlama TVL adapter contracts and
 * leaves discovery-only addresses with empty Verified/Proxy columns.
 */
function loadDiscoveryAddresses(repoRoot: string, slug: string): DiscoveryAddress[] {
  const dir = join(repoRoot, "data", "submissions", slug, "discovery");
  if (!existsSync(dir)) return [];
  const out: DiscoveryAddress[] = [];
  const seen = new Set<string>();
  const push = (chain: unknown, address: unknown, context: unknown) => {
    if (typeof chain !== "string" || typeof address !== "string") return;
    if (!chain || !address) return;
    const k = `${chain.toLowerCase()}|${address.toLowerCase()}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({
      chain,
      address,
      context: typeof context === "string" && context ? context : null,
    });
  };
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(dir, file), "utf8"));
    } catch {
      continue;
    }
    const items = Array.isArray(parsed) ? parsed : [parsed];
    for (const it of items) {
      if (!it || typeof it !== "object") continue;
      const meta = (it as { protocol_metadata?: unknown }).protocol_metadata;
      if (meta && typeof meta === "object") {
        const admins = (meta as { admin_addresses?: unknown }).admin_addresses;
        if (Array.isArray(admins)) {
          for (const a of admins) {
            if (!a || typeof a !== "object") continue;
            const r = a as { chain?: unknown; address?: unknown; role?: unknown };
            push(r.chain, r.address, r.role);
          }
        }
      }
      const evidence = (it as { evidence?: unknown }).evidence;
      if (Array.isArray(evidence)) {
        for (const e of evidence) {
          if (!e || typeof e !== "object") continue;
          const r = e as { chain?: unknown; address?: unknown; shows?: unknown };
          push(r.chain, r.address, r.shows);
        }
      }
    }
  }
  return out;
}

function listSlugs(repoRoot: string): string[] {
  // Union of slugs that have an adapter.json (TVL pipeline) or a
  // data/submissions/<slug>/discovery directory (LLM-curated addresses).
  const slugs = new Set<string>();
  const enrichRoot = join(repoRoot, "data", "enrichment");
  if (existsSync(enrichRoot)) {
    for (const entry of readdirSync(enrichRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (existsSync(join(enrichRoot, entry.name, "adapter.json"))) slugs.add(entry.name);
    }
  }
  const subsRoot = join(repoRoot, "data", "submissions");
  if (existsSync(subsRoot)) {
    for (const entry of readdirSync(subsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (existsSync(join(subsRoot, entry.name, "discovery"))) slugs.add(entry.name);
    }
  }
  return [...slugs].sort();
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

  const allSlugs = listSlugs(opts.repoRoot);
  const filtered = opts.slug ? allSlugs.filter((s) => s === opts.slug) : allSlugs;

  if (filtered.length === 0) {
    console.error(`[sourcecode] no adapter.json or discovery submissions matched (slug=${opts.slug ?? "(all)"})`);
    process.exit(1);
  }

  console.error(`[sourcecode] processing ${filtered.length} slugs`);

  // Cross-protocol + cross-run dedup: load any existing sourcecode.json
  // records into the in-memory cache so a capped/interrupted run resumes.
  const fetchedCache = opts.forceRefetch
    ? new Map<string, FetchedEntry>()
    : loadFetchedCache(opts.repoRoot, opts.apiKey !== null);
  if (fetchedCache.size > 0) {
    console.error(
      `[sourcecode] resumed with ${fetchedCache.size} cached (chain,address) entries from prior runs`,
    );
  }
  let calls = 0;
  let cacheHits = 0;
  let limitedSkips = 0;

  for (const slug of filtered) {
    const adapterPath = join(opts.repoRoot, "data", "enrichment", slug, "adapter.json");
    const adapter = existsSync(adapterPath) ? loadAdapter(adapterPath) : null;

    const seen = new Set<string>();
    const entries: SourceCodeAddress[] = [];

    const processAddress = async (chain: string, address: string, context: string | null) => {
      const k = key(chain, address);
      if (seen.has(k)) return;
      seen.add(k);

      let fetched = fetchedCache.get(k) ?? null;
      if (fetched) {
        cacheHits++;
      } else if (isSupportedChain(chain)) {
        if (opts.limit !== null && calls >= opts.limit) {
          limitedSkips++;
          entries.push(buildAddressEntry(chain, address, context, null, opts.apiKey));
          return;
        }
        fetched = await fetchOneAddress(chain, address, opts.apiKey, opts.rateLimitMs);
        fetchedCache.set(k, fetched);
        calls++;
      }
      entries.push(buildAddressEntry(chain, address, context, fetched, opts.apiKey));
    };

    if (adapter) {
      for (const a of adapter.static_addresses) {
        if (!a.chain) continue; // chain attribution is required for any explorer call
        await processAddress(a.chain, a.address, a.context);
      }
    }

    // Discovery addresses (admin_addresses + evidence). Same fetch path; new
    // entries get tagged with role/shows as their context. Adapter rows that
    // also appear in discovery are deduped by `seen`.
    const discoveryAddrs = loadDiscoveryAddresses(opts.repoRoot, slug);
    for (const d of discoveryAddrs) {
      await processAddress(d.chain, d.address, d.context);
    }

    entries.sort((x, y) => {
      if (x.chain !== y.chain) return x.chain.localeCompare(y.chain);
      return x.address.localeCompare(y.address);
    });

    const out: SourceCodeFile = {
      slug,
      adapter_commit: adapter?.adapter_commit ?? null,
      fetched_at: new Date().toISOString(),
      etherscan_v: opts.apiKey ? "v2" : null,
      addresses: entries,
      summary: summarize(entries),
    };
    writeSourceCode(opts.repoRoot, slug, out);
  }

  console.error(
    `[sourcecode] done: ${calls} fresh fetches, ${cacheHits} cache hits` +
      (limitedSkips > 0 ? `, ${limitedSkips} skipped due to FETCH_LIMIT` : "") +
      ` across ${filtered.length} protocols`,
  );
  if (limitedSkips > 0) {
    console.error(
      `[sourcecode] re-run (without --force-refetch) to pick up the ${limitedSkips} skipped addresses`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
