#!/usr/bin/env node
/**
 * defipunkd-scrape-defiscan
 *
 * Mirrors the protocol listings published on defiscan.info into
 * `data/enrichment/<slug>/defiscan.json`. Source-of-truth lives in two
 * upstream repos:
 *   - deficollective/defiscan-v2  (primary)
 *   - deficollective/defiscan     (legacy fallback)
 *
 * Both repos expose protocol entries as YAML/Markdown frontmatter files
 * under a `protocols/` (or similarly-named) directory. The exact layout
 * has shifted between v1 and v2, so this script:
 *   1. Pulls the repo tree via GitHub's API.
 *   2. Heuristically picks any markdown / MDX / YAML file whose path
 *      contains the word "protocol".
 *   3. Parses YAML frontmatter (or top-level YAML) for `name`, `slug`,
 *      `id`, `stage`.
 *   4. Resolves the entry's slug against the DefiLlama snapshot using
 *      the same `isMatch()` fuzzy matcher used by the auditors / bounty
 *      pipelines.
 *   5. Writes `defiscan.json` per matched protocol; logs unresolved
 *      entries to `data/enrichment/_defiscan-unresolved.log`.
 *   6. Removes stale `defiscan.json` files for protocols that fell out
 *      of both upstream repos.
 *
 * Usage:
 *   pnpm --filter @defipunkd/enrichment run scrape-defiscan
 *   GITHUB_TOKEN=... pnpm ... run scrape-defiscan   # avoids the 60/h anon limit
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ProtocolSnapshot, Snapshot } from "@defipunkd/registry";

import { isMatch } from "../audit-match.js";
import { writeStableTimestampedJson } from "../stable-write.js";

interface CliOptions {
  repoRoot: string;
  dryRun: boolean;
}

type Source = "defiscan" | "defiscan-v2";

interface ParsedEntry {
  /** Identifier used to build the defiscan.info URL (kebab-case slug). */
  id: string;
  name: string | null;
  stage: "0" | "1" | "2" | "R" | null;
  source: Source;
  /** Path within the upstream repo; helps debug when an entry can't be resolved. */
  source_path: string;
  /** Chain segment derived from the file (e.g. "ethereum" for
   * `protocols/curve-finance/ethereum.mdx`). v1 splits a protocol across one
   * file per chain; v2 may use a single index file. */
  chain: string | null;
  /** DefiLlama slugs declared in the upstream `data.json` (canonical mapping
   * to our registry; bypasses fuzzy matching when present). */
  defillama_slugs: string[];
}

interface CollapsedEntry {
  id: string;
  name: string | null;
  source: Source;
  source_path: string;
  defillama_slugs: string[];
  headline_stage: "0" | "1" | "2" | "R" | null;
  deployments: Array<{ chain: string; stage: "0" | "1" | "2" | "R" | null; url: string }>;
}

interface ResolvedEntry extends CollapsedEntry {
  /** Slug in our defillama snapshot. */
  registry_slug: string;
  url: string;
}

const REPOS: Array<{ source: Source; repo: string }> = [
  // v2 takes precedence — it is the maintained surface as of 2025+.
  { source: "defiscan-v2", repo: "deficollective/defiscan-v2" },
  { source: "defiscan", repo: "deficollective/defiscan" },
];

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
  let dryRun = false;
  for (const a of argv) {
    if (a === "--dry-run") dryRun = true;
  }
  return {
    repoRoot: resolve(process.env.DEFIPUNKD_REPO_ROOT ?? findRepoRoot()),
    dryRun,
  };
}

const ghHeaders: Record<string, string> = {
  Accept: "application/vnd.github+json",
  "User-Agent": "defipunkd-scrape-defiscan",
};
if (process.env.GITHUB_TOKEN) ghHeaders.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

interface GhTreeEntry {
  path: string;
  type: "blob" | "tree";
  sha: string;
}

async function fetchTree(repo: string): Promise<GhTreeEntry[]> {
  const url = `https://api.github.com/repos/${repo}/git/trees/HEAD?recursive=1`;
  const res = await fetch(url, { headers: ghHeaders });
  if (!res.ok) {
    console.error(`[scrape-defiscan] ${repo}: tree fetch failed ${res.status} ${res.statusText}`);
    return [];
  }
  const json = (await res.json()) as { tree?: GhTreeEntry[]; truncated?: boolean };
  if (json.truncated) {
    console.error(`[scrape-defiscan] ${repo}: tree truncated — some entries may be missing`);
  }
  return json.tree ?? [];
}

async function fetchRaw(repo: string, path: string): Promise<string | null> {
  const url = `https://raw.githubusercontent.com/${repo}/HEAD/${path}`;
  const res = await fetch(url, { headers: { "User-Agent": ghHeaders["User-Agent"]! } });
  if (!res.ok) return null;
  return await res.text();
}

/** Pull `defillama_slug` from a YAML-frontmatter or JSON file. The upstream
 * field is sometimes a single string, sometimes an array — we normalize. */
function extractDefiLlamaSlugs(filePath: string, raw: string): string[] {
  if (filePath.endsWith(".json")) {
    try {
      const j = JSON.parse(raw) as Record<string, unknown>;
      const v = j.defillama_slug ?? j.defillama_slugs;
      if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string").map((s) => s.toLowerCase());
      if (typeof v === "string") return [v.toLowerCase()];
    } catch { /* fall through */ }
    return [];
  }
  // YAML frontmatter: `defillama_slug: ["a", "b"]` or `defillama_slug: "a"`.
  const fm = raw.match(/^---\n([\s\S]*?)\n---/);
  const body = fm ? fm[1]! : raw;
  const m = body.match(/^defillama_slug\s*:\s*(.+)$/m);
  if (!m) return [];
  const val = m[1]!.trim();
  if (val.startsWith("[")) {
    return [...val.matchAll(/["']([^"']+)["']/g)].map((x) => x[1]!.toLowerCase());
  }
  return [val.replace(/^["']|["']$/g, "").toLowerCase()];
}

/** Parse a JSON entry's flat top-level string fields into the same shape as
 * the YAML frontmatter reader so the downstream code is uniform. */
function parseJsonEntry(raw: string): Record<string, string> | null {
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(j)) {
      if (typeof v === "string") out[k.toLowerCase()] = v;
      else if (typeof v === "number" || typeof v === "boolean") out[k.toLowerCase()] = String(v);
    }
    return out;
  } catch {
    return null;
  }
}

/** Pull frontmatter (`---\n...\n---`) or treat the whole file as YAML. */
function extractFrontmatter(raw: string): Record<string, string> | null {
  const fm = raw.match(/^---\n([\s\S]*?)\n---/);
  const body = fm ? fm[1]! : raw;
  const out: Record<string, string> = {};
  // Minimal flat-YAML reader: `key: value` lines, ignore nested blocks.
  // Defiscan entries put `stage`, `name`, `id`, `slug` at the top level.
  let inBlock = false;
  let blockIndent = 0;
  for (const line of body.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const indent = line.match(/^(\s*)/)![1]!.length;
    if (inBlock && indent > blockIndent) continue;
    inBlock = false;
    const m = line.match(/^(\s*)([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    if (m[1]!.length > 0) continue;        // top-level only
    const key = m[2]!;
    const rawVal = m[3]!.trim();
    if (rawVal === "" || rawVal === "|" || rawVal === ">") {
      inBlock = true;
      blockIndent = indent;
      continue;
    }
    out[key.toLowerCase()] = rawVal.replace(/^["']|["']$/g, "");
  }
  return out;
}

function normalizeStage(raw: string | undefined): "0" | "1" | "2" | "R" | null {
  if (!raw) return null;
  const s = raw.toLowerCase().replace(/^stage\s*/, "").trim();
  if (s === "0" || s === "1" || s === "2") return s;
  if (s === "r" || s.startsWith("review")) return "R";
  return null;
}

function deriveId(filePath: string, fm: Record<string, string>): { id: string; chain: string | null } | null {
  // v1 layout: `<...>/protocols/<protocol-slug>/<chain>.mdx` (matches the
  // public URL scheme `defiscan.info/protocols/<protocol>/<chain>`).
  // v2 layout (best guess until confirmed): `<...>/protocols/<protocol>/index.<ext>`
  // or `<...>/protocols/<protocol>.<ext>`.
  // We derive the protocol id from the directory immediately under `protocols/`,
  // and capture the per-chain file stem so we can aggregate stages across
  // deployments later.
  const parts = filePath.split("/");
  const pIdx = parts.findIndex((p) => /^protocols?$/i.test(p));
  if (pIdx >= 0 && pIdx + 1 < parts.length) {
    const after = parts.slice(pIdx + 1);
    if (after.length === 1) {
      // protocols/<slug>.<ext>
      const stem = after[0]!.replace(/\.(mdx?|ya?ml|json)$/i, "");
      return { id: stem.toLowerCase(), chain: null };
    }
    // protocols/<slug>/<file>.<ext>
    const slug = after[0]!.toLowerCase();
    const fileStem = after[after.length - 1]!.replace(/\.(mdx?|ya?ml|json)$/i, "").toLowerCase();
    // `index` and `data` are protocol-level metadata files (defiscan v1's
    // data.json carries id / website / defillama_slug); treat them as
    // chain-less so they don't pollute the deployments list.
    const chain = fileStem === "index" || fileStem === "data" ? null : fileStem;
    return { id: slug, chain };
  }
  // Frontmatter fallback when the path layout is unfamiliar.
  const explicit = fm.slug ?? fm.id ?? fm.protocol_slug;
  if (explicit) return { id: explicit.toLowerCase().trim(), chain: null };
  return null;
}

function isProtocolEntry(path: string): boolean {
  // Match anything under a protocols/ (or similarly named) folder.
  if (!/(^|\/)(protocols?)(\/|-)/i.test(path)) return false;
  return /\.(mdx?|ya?ml|json)$/i.test(path);
}

async function harvestRepo(source: Source, repo: string): Promise<ParsedEntry[]> {
  const tree = await fetchTree(repo);
  const candidates = tree.filter((t) => t.type === "blob" && isProtocolEntry(t.path));
  console.error(`[scrape-defiscan] ${repo}: ${candidates.length} candidate files`);
  if (candidates.length === 0) {
    // Path layout drifted (notably defiscan-v2 doesn't ship Markdown files
    // under `protocols/`). Dump a sample so the user can retune `isProtocolEntry`.
    const probes = tree
      .filter((t) => t.type === "blob" && /protocol/i.test(t.path))
      .slice(0, 20)
      .map((t) => t.path);
    if (probes.length > 0) {
      console.error(`[scrape-defiscan] ${repo}: layout probe — sample paths containing "protocol":`);
      for (const p of probes) console.error(`  ${p}`);
    } else {
      console.error(`[scrape-defiscan] ${repo}: tree has no path containing "protocol" — repo layout fully unknown`);
    }
  }
  const out: ParsedEntry[] = [];
  for (const c of candidates) {
    const raw = await fetchRaw(repo, c.path);
    if (!raw) continue;
    const fm = c.path.endsWith(".json") ? parseJsonEntry(raw) : extractFrontmatter(raw);
    if (!fm) continue;
    const stage = normalizeStage(fm.stage);
    const derived = deriveId(c.path, fm);
    if (!derived) continue;
    out.push({
      id: derived.id,
      chain: derived.chain,
      name: fm.name ?? fm.title ?? fm.protocol ?? null,
      stage,
      source,
      source_path: c.path,
      defillama_slugs: extractDefiLlamaSlugs(c.path, raw),
    });
  }
  return out;
}

function loadSnapshot(repoRoot: string): Snapshot {
  return JSON.parse(readFileSync(join(repoRoot, "data", "defillama-snapshot.json"), "utf8")) as Snapshot;
}

function defiscanUrl(id: string): string {
  // defiscan-v2 publishes at defiscan.info/protocols/<id>; the legacy site
  // used the same path scheme. If v2 ever migrates we update here.
  return `https://www.defiscan.info/protocols/${id}`;
}

/** Collapse multiple per-chain files into one entry per (source, id). v1
 * publishes a separate file per deployment chain plus a top-level `data.json`;
 * we keep each chain as its own deployment record and pick a `headline_stage`
 * for the single-value badge.
 *
 * Headline policy mirrors what defiscan.info shows on a protocol's root page:
 *   1. If an `ethereum.*` deployment exists, use its stage (mainnet headlines).
 *   2. Else fall back to the highest stage across deployments (best showing).
 *
 * `defillama_slugs` is unioned across all files (data.json typically has the
 * canonical mapping). */
function collapseEntries(entries: ParsedEntry[]): CollapsedEntry[] {
  const STAGE_RANK: Record<string, number> = { "R": -1, "0": 0, "1": 1, "2": 2 };
  interface Bucket {
    id: string;
    name: string | null;
    source: Source;
    source_path: string;
    slugSet: Set<string>;
    perChainStage: Map<string, "0" | "1" | "2" | "R" | null>;
  }
  const byKey = new Map<string, Bucket>();
  for (const e of entries) {
    const key = `${e.source}:${e.id}`;
    let b = byKey.get(key);
    if (!b) {
      b = {
        id: e.id,
        name: e.name,
        source: e.source,
        source_path: e.source_path,
        slugSet: new Set(),
        perChainStage: new Map(),
      };
      byKey.set(key, b);
    }
    if (!b.name && e.name) b.name = e.name;
    for (const s of e.defillama_slugs) b.slugSet.add(s);
    // Per-chain stage: a chain may have multiple files (e.g. `ethereum.md` +
    // some shared yaml); keep the first non-null encountered.
    if (e.chain) {
      const existing = b.perChainStage.get(e.chain);
      if (existing == null && e.stage != null) b.perChainStage.set(e.chain, e.stage);
      else if (!b.perChainStage.has(e.chain)) b.perChainStage.set(e.chain, null);
    }
  }
  return [...byKey.values()].map((b) => {
    const deployments = [...b.perChainStage.entries()]
      .map(([chain, stage]) => ({
        chain,
        stage,
        url: `https://www.defiscan.info/protocols/${b.id}/${chain}`,
      }))
      .sort((a, c) => {
        // Ethereum first, then by stage desc, then alphabetical.
        if (a.chain === "ethereum") return -1;
        if (c.chain === "ethereum") return 1;
        const sa = a.stage ? STAGE_RANK[a.stage]! : -2;
        const sc = c.stage ? STAGE_RANK[c.stage]! : -2;
        if (sa !== sc) return sc - sa;
        return a.chain.localeCompare(c.chain);
      });
    const ethStage = b.perChainStage.get("ethereum") ?? null;
    let bestStage: "0" | "1" | "2" | "R" | null = null;
    for (const s of b.perChainStage.values()) {
      if (s == null) continue;
      if (bestStage == null || STAGE_RANK[s]! > STAGE_RANK[bestStage]!) bestStage = s;
    }
    return {
      id: b.id,
      name: b.name,
      source: b.source,
      source_path: b.source_path,
      defillama_slugs: [...b.slugSet],
      headline_stage: ethStage ?? bestStage,
      deployments,
    };
  });
}

function resolveAgainstRegistry(
  entries: CollapsedEntry[],
  protocols: ProtocolSnapshot[],
): { resolved: ResolvedEntry[]; unresolved: CollapsedEntry[] } {
  const resolved: ResolvedEntry[] = [];
  const unresolved: CollapsedEntry[] = [];
  // Index protocols once for cheap exact-slug match.
  const bySlug = new Map<string, ProtocolSnapshot>();
  for (const p of protocols) bySlug.set(p.slug.toLowerCase(), p);

  for (const e of entries) {
    // Prefer the explicit `defillama_slug` declared in upstream `data.json` —
    // it's the canonical mapping and avoids the fuzzy matcher missing on
    // renamed protocols (sky/maker, pool-together-v5, etc.).
    let hit: ProtocolSnapshot | null = null;
    for (const s of e.defillama_slugs) {
      const m = bySlug.get(s);
      if (m) { hit = m; break; }
    }
    if (!hit) hit = bySlug.get(e.id) ?? null;
    if (!hit && e.name) {
      const nameSlug = e.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      hit = bySlug.get(nameSlug) ?? null;
    }
    if (!hit) {
      // Fuzzy fallback via the audit-match tokenizer.
      const probeName = e.name ?? e.id;
      const probeTokens = (e.name ?? e.id).split(/[^A-Za-z0-9]+/).filter(Boolean);
      for (const p of protocols) {
        if (isMatch({ slug: p.slug, name: p.name }, { tokens: probeTokens, raw_name: probeName })) {
          hit = p;
          break;
        }
      }
    }
    if (!hit) {
      unresolved.push(e);
      continue;
    }
    resolved.push({ ...e, registry_slug: hit.slug, url: defiscanUrl(e.id) });
  }
  return { resolved, unresolved };
}

function dedupeByRegistrySlug(entries: ResolvedEntry[]): Map<string, ResolvedEntry> {
  // v2 wins over v1 when both list the same protocol.
  const out = new Map<string, ResolvedEntry>();
  for (const e of entries) {
    const prev = out.get(e.registry_slug);
    if (!prev) { out.set(e.registry_slug, e); continue; }
    if (prev.source === "defiscan" && e.source === "defiscan-v2") out.set(e.registry_slug, e);
  }
  return out;
}

function listExistingDefiscan(repoRoot: string): string[] {
  const enrichDir = join(repoRoot, "data", "enrichment");
  if (!existsSync(enrichDir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(enrichDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (existsSync(join(enrichDir, entry.name, "defiscan.json"))) out.push(entry.name);
  }
  return out;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const allParsed: ParsedEntry[] = [];
  for (const { source, repo } of REPOS) {
    try {
      const entries = await harvestRepo(source, repo);
      console.error(`[scrape-defiscan] ${repo}: parsed ${entries.length} entries`);
      allParsed.push(...entries);
    } catch (err) {
      console.error(`[scrape-defiscan] ${repo}: harvest failed — ${(err as Error).message}`);
    }
  }
  if (allParsed.length === 0) {
    console.error("[scrape-defiscan] no entries parsed from either repo — aborting (likely a parser/path drift)");
    process.exit(1);
  }

  const snapshot = loadSnapshot(opts.repoRoot);
  const protocols = Object.values(snapshot.protocols);
  const collapsed = collapseEntries(allParsed);
  console.error(`[scrape-defiscan] ${allParsed.length} per-chain files collapsed into ${collapsed.length} per-protocol entries`);
  const { resolved, unresolved } = resolveAgainstRegistry(collapsed, protocols);
  const final = dedupeByRegistrySlug(resolved);

  console.error(`[scrape-defiscan] resolved=${final.size} unresolved=${unresolved.length}`);

  const fetchedAt = new Date().toISOString();
  const writeRoot = join(opts.repoRoot, "data", "enrichment");

  // Write per-slug files.
  for (const [slug, e] of final) {
    const dir = join(writeRoot, slug);
    if (!opts.dryRun) mkdirSync(dir, { recursive: true });
    const payload = {
      slug,
      fetched_at: fetchedAt,
      url: e.url,
      headline_stage: e.headline_stage,
      deployments: e.deployments,
      source: e.source,
    };
    if (!opts.dryRun) {
      writeStableTimestampedJson(join(dir, "defiscan.json"), payload, "fetched_at");
    }
  }

  // Sweep stale files.
  const stale = listExistingDefiscan(opts.repoRoot).filter((s) => !final.has(s));
  for (const slug of stale) {
    const path = join(writeRoot, slug, "defiscan.json");
    console.error(`[scrape-defiscan] removing stale ${path}`);
    if (!opts.dryRun) rmSync(path, { force: true });
  }

  // Unresolved log.
  const logPath = join(writeRoot, "_defiscan-unresolved.log");
  const logBody = unresolved.length === 0
    ? `# scrape-defiscan ${fetchedAt}\n# (all entries resolved)\n`
    : [
      `# scrape-defiscan ${fetchedAt}`,
      `# ${unresolved.length} upstream entries did not match any protocol in defillama-snapshot.json`,
      ...unresolved.map((e) => `${e.source}\t${e.id}\t${e.name ?? ""}\t${e.source_path}`),
    ].join("\n") + "\n";
  if (!opts.dryRun) writeFileSync(logPath, logBody);
}

main().catch((err) => {
  console.error("[scrape-defiscan] fatal:", err);
  process.exit(1);
});
