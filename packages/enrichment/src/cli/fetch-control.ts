#!/usr/bin/env node
/**
 * defipunkd-fetch-control
 *
 * For every (chain, address) in `data/enrichment/<slug>/adapter.json`:
 *   1. Read `owner()` via Etherscan eth_call (returns null if the contract
 *      doesn't have an owner function).
 *   2. Check whether the address itself is a Safe via Safe TS (rare but
 *      sometimes a treasury Safe IS the entry point).
 *   3. If we found an owner, also check whether the OWNER is a Safe — this
 *      is the common governance-multisig case (UpgradeableProxy / Ownable
 *      contract owned by a 5-of-9 Safe).
 *
 * Output: data/enrichment/<slug>/control.json — the deterministic chunk of
 * the control surface, ready to feed the `control` slice grader.
 *
 * Usage:
 *   ETHERSCAN_API_KEY=... pnpm --filter @defipunkd/enrichment exec \
 *     tsx src/cli/fetch-control.ts                                 # all
 *   ETHERSCAN_API_KEY=... pnpm ... fetch-control.ts --slug lido    # one
 *
 * Resume across runs: this CLI loads every existing control.json on startup
 * and reuses (chain, address) records that have a successful fetched flag
 * (same pattern as fetch-sourcecode). Use --force-refetch to bypass.
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
import { fetchOwner } from "../fetch-owner.js";
import { fetchSafe, type NotSafeReason, type SafeMetadata } from "../fetch-safe.js";
import type { FetchFn } from "../fetch-etherscan.js";

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
  static_addresses: Array<{
    chain: string | null;
    address: string;
    context: string | null;
  }>;
}

interface ControlAddress {
  chain: string;
  address: string;
  context: string | null;
  /** True when the contract address itself is a Safe (rare). */
  self_is_safe: boolean;
  self_safe: SafeMetadata | null;
  /** Why self isn't a Safe — "likely_eoa" / "not_indexed" / "skipped" / null. */
  self_not_safe_reason: NotSafeReason | null;
  /** Address from `owner()`. Null when the contract has no owner function or
   *  the call returned 0x000…0 (renounced). */
  owner: string | null;
  /** True when the owner address is a Safe (the common multisig pattern). */
  owner_is_safe: boolean;
  owner_safe: SafeMetadata | null;
  /** Why the owner isn't a Safe. "likely_eoa" here is the loudest possible
   *  control-slice red flag — the contract is owned by a single private key. */
  owner_not_safe_reason: NotSafeReason | null;
  /** Whether each fetch was attempted (false → skipped due to limits / errors). */
  fetched: { owner: boolean; self: boolean; owner_safe: boolean };
  warnings: string[];
}

interface ControlFile {
  slug: string;
  adapter_commit: string | null;
  fetched_at: string;
  addresses: ControlAddress[];
  summary: {
    total: number;
    owners_resolved: number;
    self_is_safe: number;
    owner_is_safe: number;
    /** Number of contracts whose owner is an EOA (single-key) — the loudest
     *  control-slice red flag. */
    owner_is_eoa: number;
    unique_owner_safes: number;
    unique_owners: number;
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

function key(chain: string, address: string): string {
  return `${chain}|${address.toLowerCase()}`;
}

interface AddressFetched {
  self_is_safe: boolean;
  self_safe: SafeMetadata | null;
  self_not_safe_reason: NotSafeReason | null;
  owner: string | null;
  fetched: { owner: boolean; self: boolean };
  warnings: string[];
}

interface OwnerSafeFetched {
  is_safe: boolean;
  safe: SafeMetadata | null;
  not_safe_reason: NotSafeReason | null;
  warnings: string[];
}

async function fetchOneAddress(
  chain: string,
  address: string,
  apiKey: string | null,
  rateLimitMs: number,
): Promise<AddressFetched> {
  const warnings: string[] = [];
  const result: AddressFetched = {
    self_is_safe: false,
    self_safe: null,
    self_not_safe_reason: null,
    owner: null,
    fetched: { owner: false, self: false },
    warnings,
  };
  if (apiKey) {
    const r = await fetchOwner({ chain, address, apiKey, fetch: fetchFn });
    result.owner = r.owner;
    result.fetched.owner = true;
    warnings.push(...r.warnings);
    if (rateLimitMs > 0) await sleep(rateLimitMs);
  }
  const safe = await fetchSafe({ chain, address, fetch: fetchFn });
  result.self_is_safe = safe.is_safe;
  result.self_safe = safe.safe;
  result.self_not_safe_reason = safe.not_safe_reason;
  result.fetched.self = true;
  warnings.push(...safe.warnings);
  if (rateLimitMs > 0) await sleep(rateLimitMs);
  return result;
}

async function fetchOwnerSafe(
  chain: string,
  ownerAddress: string,
  rateLimitMs: number,
): Promise<OwnerSafeFetched> {
  const safe = await fetchSafe({ chain, address: ownerAddress, fetch: fetchFn });
  if (rateLimitMs > 0) await sleep(rateLimitMs);
  return {
    is_safe: safe.is_safe,
    safe: safe.safe,
    not_safe_reason: safe.not_safe_reason,
    warnings: safe.warnings,
  };
}

function isCacheable(entry: ControlAddress, hasApiKey: boolean): boolean {
  const fatal = (entry.warnings ?? []).some((w) => /http \d|fetch failed|non-json/i.test(w));
  if (fatal) return false;
  const ownerOk = hasApiKey ? entry.fetched.owner : true;
  const selfOk = entry.fetched.self;
  return ownerOk && selfOk;
}

function loadFetchedCache(
  repoRoot: string,
  hasApiKey: boolean,
): Map<string, ControlAddress> {
  const cache = new Map<string, ControlAddress>();
  const root = join(repoRoot, "data", "enrichment");
  if (!existsSync(root)) return cache;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(root, entry.name, "control.json");
    if (!existsSync(path)) continue;
    let file: ControlFile;
    try {
      file = JSON.parse(readFileSync(path, "utf8")) as ControlFile;
    } catch {
      continue;
    }
    for (const a of file.addresses) {
      if (!isCacheable(a, hasApiKey)) continue;
      const k = key(a.chain, a.address);
      if (!cache.has(k)) cache.set(k, a);
    }
  }
  return cache;
}

function summarize(entries: ControlAddress[]): ControlFile["summary"] {
  let owners_resolved = 0;
  let self_is_safe = 0;
  let owner_is_safe = 0;
  let owner_is_eoa = 0;
  const uniqueOwners = new Set<string>();
  const uniqueOwnerSafes = new Set<string>();
  for (const e of entries) {
    if (e.owner) {
      owners_resolved++;
      uniqueOwners.add(`${e.chain}|${e.owner}`);
    }
    if (e.self_is_safe) self_is_safe++;
    if (e.owner_is_safe) {
      owner_is_safe++;
      if (e.owner) uniqueOwnerSafes.add(`${e.chain}|${e.owner}`);
    }
    if (e.owner && e.owner_not_safe_reason === "likely_eoa") owner_is_eoa++;
  }
  return {
    total: entries.length,
    owners_resolved,
    self_is_safe,
    owner_is_safe,
    owner_is_eoa,
    unique_owner_safes: uniqueOwnerSafes.size,
    unique_owners: uniqueOwners.size,
  };
}

function loadAdapter(path: string): AdapterFile | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as AdapterFile;
  } catch {
    return null;
  }
}

function writeControl(repoRoot: string, slug: string, file: ControlFile): void {
  const outDir = join(repoRoot, "data", "enrichment", slug);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "control.json"), `${JSON.stringify(file, null, 2)}\n`);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  if (!opts.apiKey) {
    console.error("[control] ETHERSCAN_API_KEY not set — owner() reads disabled, only Safe checks will run");
  }

  const adapterPaths = listAdapterFiles(opts.repoRoot);
  const filtered = opts.slug
    ? adapterPaths.filter((p) => p.includes(`/${opts.slug}/`))
    : adapterPaths;

  if (filtered.length === 0) {
    console.error(`[control] no adapter.json files matched (slug=${opts.slug ?? "(all)"})`);
    process.exit(1);
  }

  console.error(`[control] processing ${filtered.length} adapter files`);

  const fetchedCache = opts.forceRefetch
    ? new Map<string, ControlAddress>()
    : loadFetchedCache(opts.repoRoot, opts.apiKey !== null);
  if (fetchedCache.size > 0) {
    console.error(`[control] resumed with ${fetchedCache.size} cached (chain,address) entries`);
  }

  // Cross-protocol owner-safe cache: many protocols share the same 5-of-9
  // governance Safe (e.g., a multi-product DAO). Memoize by (chain, owner).
  const ownerSafeCache = new Map<string, OwnerSafeFetched>();

  let calls = 0;
  let cacheHits = 0;
  let limitedSkips = 0;

  for (const adapterPath of filtered) {
    const adapter = loadAdapter(adapterPath);
    if (!adapter) continue;
    // Read commit hash from adapter.json (already loaded above as raw text once
    // through loadAdapter, but we need the field).
    let adapterCommit: string | null = null;
    try {
      const raw = JSON.parse(readFileSync(adapterPath, "utf8")) as { adapter_commit?: string };
      adapterCommit = raw.adapter_commit ?? null;
    } catch {
      adapterCommit = null;
    }

    const seen = new Set<string>();
    const entries: ControlAddress[] = [];

    for (const a of adapter.static_addresses) {
      if (!a.chain) continue;
      const k = key(a.chain, a.address);
      if (seen.has(k)) continue;
      seen.add(k);

      let cached = fetchedCache.get(k);
      let entry: ControlAddress;
      if (cached) {
        cacheHits++;
        entry = { ...cached, context: a.context };
      } else if (!isSupportedChain(a.chain)) {
        entry = {
          chain: a.chain,
          address: a.address,
          context: a.context,
          self_is_safe: false,
          self_safe: null,
          self_not_safe_reason: "skipped",
          owner: null,
          owner_is_safe: false,
          owner_safe: null,
          owner_not_safe_reason: null,
          fetched: { owner: false, self: false, owner_safe: false },
          warnings: [`skipped: chain "${a.chain}" not supported`],
        };
      } else if (opts.limit !== null && calls >= opts.limit) {
        limitedSkips++;
        entry = {
          chain: a.chain,
          address: a.address,
          context: a.context,
          self_is_safe: false,
          self_safe: null,
          self_not_safe_reason: null,
          owner: null,
          owner_is_safe: false,
          owner_safe: null,
          owner_not_safe_reason: null,
          fetched: { owner: false, self: false, owner_safe: false },
          warnings: ["skipped: FETCH_LIMIT reached"],
        };
      } else {
        const fetched = await fetchOneAddress(a.chain, a.address, opts.apiKey, opts.rateLimitMs);
        calls++;
        entry = {
          chain: a.chain,
          address: a.address,
          context: a.context,
          self_is_safe: fetched.self_is_safe,
          self_safe: fetched.self_safe,
          self_not_safe_reason: fetched.self_not_safe_reason,
          owner: fetched.owner,
          owner_is_safe: false,
          owner_safe: null,
          owner_not_safe_reason: null,
          fetched: { owner: fetched.fetched.owner, self: fetched.fetched.self, owner_safe: false },
          warnings: fetched.warnings,
        };
        fetchedCache.set(k, entry);
      }

      // If we have an owner address that we haven't checked yet, check it.
      if (entry.owner && !entry.fetched.owner_safe) {
        const ownerKey = key(entry.chain, entry.owner);
        let osf = ownerSafeCache.get(ownerKey) ?? null;
        if (!osf) {
          if (opts.limit !== null && calls >= opts.limit) {
            entry.warnings.push("skipped owner-safe check: FETCH_LIMIT reached");
          } else {
            osf = await fetchOwnerSafe(entry.chain, entry.owner, opts.rateLimitMs);
            ownerSafeCache.set(ownerKey, osf);
            calls++;
          }
        }
        if (osf) {
          entry.owner_is_safe = osf.is_safe;
          entry.owner_safe = osf.safe;
          entry.owner_not_safe_reason = osf.not_safe_reason;
          entry.fetched.owner_safe = true;
          entry.warnings.push(...osf.warnings);
          fetchedCache.set(k, entry);
        }
      }

      entries.push(entry);
    }

    entries.sort((x, y) => {
      if (x.chain !== y.chain) return x.chain.localeCompare(y.chain);
      return x.address.localeCompare(y.address);
    });

    const out: ControlFile = {
      slug: adapter.slug,
      adapter_commit: adapterCommit,
      fetched_at: new Date().toISOString(),
      addresses: entries,
      summary: summarize(entries),
    };
    writeControl(opts.repoRoot, adapter.slug, out);
  }

  console.error(
    `[control] done: ${calls} fresh fetches, ${cacheHits} cache hits` +
      (limitedSkips > 0 ? `, ${limitedSkips} skipped due to FETCH_LIMIT` : "") +
      ` across ${filtered.length} protocols`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
