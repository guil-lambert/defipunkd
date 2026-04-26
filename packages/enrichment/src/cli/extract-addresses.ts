#!/usr/bin/env node
/**
 * defipunkd-extract-addresses
 *
 * For every active protocol in `data/defillama-snapshot.json`, locate its TVL
 * adapter inside the DefiLlama-Adapters repo, parse it, and write
 * `data/enrichment/<slug>/adapter.json` with the static address list and
 * dynamic-resolution entry points.
 *
 * Usage:
 *   pnpm --filter @defipunkd/enrichment exec tsx src/cli/extract-addresses.ts
 *   pnpm --filter @defipunkd/enrichment exec tsx src/cli/extract-addresses.ts --slug lido
 *   ENRICHMENT_ADAPTERS_DIR=/tmp/dla pnpm ... extract-addresses.ts
 *
 * Environment:
 *   DEFIPUNKD_REPO_ROOT       Override repo root (default: walk up from cwd).
 *   ENRICHMENT_ADAPTERS_DIR   Where DefiLlama-Adapters lives (default: <repoRoot>/.cache/defillama-adapters).
 *                             If missing, will git-clone there. If present, will git-fetch + reset to main.
 *   ENRICHMENT_ADAPTERS_REF   Git ref to check out (default: main).
 *   ENRICHMENT_NO_FETCH=1     Skip the fetch/reset (use whatever is on disk).
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import type { ProtocolSnapshot, Snapshot } from "@defipunkd/registry";

import { loadAddressBook, type AddressBook } from "../address-book.js";
import { parseAdapter } from "../parse.js";
import type { ParsedAdapter } from "../types.js";

const ADAPTERS_REPO_URL = "https://github.com/DefiLlama/DefiLlama-Adapters.git";
const DEFAULT_REF = "main";

interface CliOptions {
  slug: string | null;
  adaptersDir: string;
  noFetch: boolean;
  repoRoot: string;
  ref: string;
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
  const repoRoot = resolve(process.env.DEFIPUNKD_REPO_ROOT ?? findRepoRoot());
  const adaptersDir = resolve(
    process.env.ENRICHMENT_ADAPTERS_DIR ?? join(repoRoot, ".cache", "defillama-adapters"),
  );
  return {
    slug,
    repoRoot,
    adaptersDir,
    noFetch: process.env.ENRICHMENT_NO_FETCH === "1",
    ref: process.env.ENRICHMENT_ADAPTERS_REF ?? DEFAULT_REF,
  };
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
}

function ensureAdapters(opts: CliOptions): string {
  const dir = opts.adaptersDir;
  if (!existsSync(dir)) {
    console.error(`[extract] cloning ${ADAPTERS_REPO_URL} → ${dir}`);
    mkdirSync(dirname(dir), { recursive: true });
    execFileSync(
      "git",
      ["clone", "--depth", "1", "--branch", opts.ref, ADAPTERS_REPO_URL, dir],
      { stdio: "inherit" },
    );
  } else if (!opts.noFetch) {
    console.error(`[extract] fetching latest in ${dir}`);
    git(dir, ["fetch", "--depth", "1", "origin", opts.ref]);
    git(dir, ["reset", "--hard", `origin/${opts.ref}`]);
  } else {
    console.error(`[extract] using existing checkout in ${dir} (no fetch)`);
  }
  const sha = git(dir, ["rev-parse", "HEAD"]);
  console.error(`[extract] adapters HEAD: ${sha}`);
  return sha;
}

/**
 * Resolve a protocol's adapter file path relative to the adapters repo's
 * `projects/` directory. Prefers `module` from the snapshot. Falls back to
 * slug-based heuristics for protocols predating the schema bump.
 */
function resolveAdapterPath(adaptersDir: string, p: ProtocolSnapshot): string | null {
  const candidates: string[] = [];
  if (p.module) candidates.push(p.module);
  candidates.push(`${p.slug}/index.js`, `${p.slug}.js`);
  for (const rel of candidates) {
    const full = join(adaptersDir, "projects", rel);
    if (existsSync(full)) return full;
  }
  return null;
}

interface ProtocolResult {
  slug: string;
  adapterUrl: string;
  parsed: ParsedAdapter | null;
  reason?: string;
}

function loadCoreAssets(adaptersDir: string): AddressBook {
  const path = join(adaptersDir, "projects", "helper", "coreAssets.json");
  if (!existsSync(path)) return new Map();
  try {
    const json = JSON.parse(readFileSync(path, "utf8"));
    return loadAddressBook(json);
  } catch (err) {
    console.error(`[extract] failed to load coreAssets.json: ${(err as Error).message}`);
    return new Map();
  }
}

function processProtocol(
  p: ProtocolSnapshot,
  adaptersDir: string,
  adaptersSha: string,
  addressBook: AddressBook,
): ProtocolResult {
  const adapterPath = resolveAdapterPath(adaptersDir, p);
  const adapterUrl = adapterPath
    ? `https://github.com/DefiLlama/DefiLlama-Adapters/blob/${adaptersSha}/projects/${
        adapterPath.split(`${adaptersDir}/projects/`)[1] ?? ""
      }`
    : "";
  if (!adapterPath) {
    return {
      slug: p.slug,
      adapterUrl,
      parsed: null,
      reason: p.module
        ? `adapter file not found at projects/${p.module}`
        : `no module field, slug-fallback paths missing`,
    };
  }
  let source: string;
  try {
    source = readFileSync(adapterPath, "utf8");
  } catch (err) {
    return {
      slug: p.slug,
      adapterUrl,
      parsed: null,
      reason: `read failed: ${(err as Error).message}`,
    };
  }
  return { slug: p.slug, adapterUrl, parsed: parseAdapter(source, { addressBook }) };
}

function writeOutput(
  repoRoot: string,
  result: ProtocolResult,
  adaptersSha: string,
  extractedAt: string,
): void {
  const outDir = join(repoRoot, "data", "enrichment", result.slug);
  mkdirSync(outDir, { recursive: true });
  const out: Record<string, unknown> = {
    slug: result.slug,
    adapter_commit: adaptersSha,
    extracted_at: extractedAt,
    adapter_url: result.adapterUrl,
  };
  if (!result.parsed) {
    out.unresolved = true;
    out.reason = result.reason ?? "unknown";
    out.static_addresses = [];
    out.dynamic_resolution = [];
    out.imports = [];
    out.warnings = [];
  } else {
    out.unresolved = false;
    out.static_addresses = result.parsed.static_addresses;
    out.dynamic_resolution = result.parsed.dynamic_resolution;
    out.imports = result.parsed.imports;
    out.warnings = result.parsed.warnings;
  }
  const outPath = join(outDir, "adapter.json");
  writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
}

/**
 * Remove enrichment dirs for slugs that are no longer in the active set,
 * so the committed tree mirrors the snapshot.
 */
function pruneStale(repoRoot: string, activeSlugs: Set<string>): number {
  const root = join(repoRoot, "data", "enrichment");
  if (!existsSync(root)) return 0;
  let removed = 0;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (activeSlugs.has(entry.name)) continue;
    rmSync(join(root, entry.name), { recursive: true, force: true });
    removed++;
  }
  return removed;
}

function loadSnapshot(repoRoot: string): Snapshot {
  const path = join(repoRoot, "data", "defillama-snapshot.json");
  return JSON.parse(readFileSync(path, "utf8")) as Snapshot;
}

function isActive(p: ProtocolSnapshot): boolean {
  return !p.is_dead && p.delisted_at === null && !p.is_parent;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const adaptersSha = ensureAdapters(opts);
  const addressBook = loadCoreAssets(opts.adaptersDir);
  console.error(`[extract] loaded ${addressBook.size} address-book entries`);

  const snapshot = loadSnapshot(opts.repoRoot);
  const all = Object.values(snapshot.protocols);
  const targets = opts.slug
    ? all.filter((p) => p.slug === opts.slug)
    : all.filter(isActive);

  if (targets.length === 0) {
    console.error(`[extract] no targets matched (slug=${opts.slug ?? "(active)"})`);
    process.exit(1);
  }

  console.error(`[extract] processing ${targets.length} protocols`);
  const extractedAt = new Date().toISOString();

  let ok = 0;
  let unresolved = 0;
  let parseFail = 0;
  let totalStatic = 0;
  let totalDynamic = 0;

  for (const p of targets) {
    const result = processProtocol(p, opts.adaptersDir, adaptersSha, addressBook);
    writeOutput(opts.repoRoot, result, adaptersSha, extractedAt);
    if (!result.parsed) {
      unresolved++;
    } else {
      ok++;
      if (result.parsed.warnings.length > 0) parseFail++;
      totalStatic += result.parsed.static_addresses.length;
      totalDynamic += result.parsed.dynamic_resolution.length;
    }
  }

  if (!opts.slug) {
    const active = new Set(targets.map((p) => p.slug));
    const removed = pruneStale(opts.repoRoot, active);
    if (removed > 0) console.error(`[extract] pruned ${removed} stale enrichment dirs`);
  }

  console.error(
    `[extract] done: ${ok} parsed, ${unresolved} unresolved, ${parseFail} parsed-with-warnings; ` +
      `${totalStatic} static addresses, ${totalDynamic} dynamic entries`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
