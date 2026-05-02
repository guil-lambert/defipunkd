#!/usr/bin/env node
/**
 * defipunkd-scrape-github-from-website
 *
 * Tier 2 of the github-recovery pipeline. For every active protocol with no
 * github in either the snapshot or its overlay (audits-without-github
 * candidates), fetch the protocol's `website` and grep the HTML for
 * `https://github.com/<org>/<repo>` links. Falls back to a docs-page link
 * (docs.<host> / *.gitbook.io / developers.<host>) when the main page
 * yields nothing.
 *
 * Writes per-slug overlays at `data/overlays/<slug>.json` with the discovered
 * URLs (full https URLs, matching the existing curve-finance.json overlay
 * format). Existing curated github values are preserved.
 *
 * A sidecar JSONL log is written to `data/auditors/scrape-github.log.jsonl`
 * recording every attempt — found, empty, http error, timeout — so we can
 * audit the recall rate and decide whether tier 3 is worth it.
 *
 * Usage:
 *   pnpm --filter @defipunkd/enrichment exec tsx src/cli/scrape-github-from-website.ts --only-with-audits
 *   pnpm --filter @defipunkd/enrichment exec tsx src/cli/scrape-github-from-website.ts --only-with-audits --apply
 *   pnpm --filter @defipunkd/enrichment exec tsx src/cli/scrape-github-from-website.ts --slug falcon-finance --apply
 *   pnpm --filter @defipunkd/enrichment exec tsx src/cli/scrape-github-from-website.ts --min-tvl 100000000 --apply
 *
 * Flags:
 *   --apply             write overlay files (default is dry-run)
 *   --only-with-audits  only consider protocols that have ≥1 audit reference
 *   --min-tvl <n>       skip protocols with TVL below this
 *   --slug <s>          process a single slug (overrides filters)
 *   --concurrency <n>   parallel requests (default 8)
 *   --timeout-ms <n>    per-request timeout (default 10000)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ProtocolSnapshot, Snapshot } from "@defipunkd/registry";

import {
  extractGithubRepos,
  extractRootHost,
  findDocsLink,
  type ExtractedRepo,
} from "../scrape-github-from-html.js";

interface CliOptions {
  apply: boolean;
  onlyWithAudits: boolean;
  minTvl: number;
  slug: string | null;
  concurrency: number;
  timeoutMs: number;
  repoRoot: string;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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
  let apply = false;
  let onlyWithAudits = false;
  let minTvl = 0;
  let slug: string | null = null;
  let concurrency = 8;
  let timeoutMs = 10_000;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") apply = true;
    else if (a === "--only-with-audits") onlyWithAudits = true;
    else if (a === "--min-tvl") minTvl = Number(argv[++i] ?? 0);
    else if (a?.startsWith("--min-tvl=")) minTvl = Number(a.slice("--min-tvl=".length));
    else if (a === "--slug") slug = argv[++i] ?? null;
    else if (a?.startsWith("--slug=")) slug = a.slice("--slug=".length);
    else if (a === "--concurrency") concurrency = Number(argv[++i] ?? 8);
    else if (a === "--timeout-ms") timeoutMs = Number(argv[++i] ?? 10_000);
  }
  return {
    apply,
    onlyWithAudits,
    minTvl: Number.isFinite(minTvl) ? minTvl : 0,
    slug,
    concurrency: Math.max(1, Math.min(32, concurrency)),
    timeoutMs,
    repoRoot: resolve(process.env.DEFIPUNKD_REPO_ROOT ?? findRepoRoot()),
  };
}

function isActive(p: ProtocolSnapshot): boolean {
  return !p.is_dead && p.delisted_at === null && !p.is_parent;
}

function hasGithub(p: ProtocolSnapshot, repoRoot: string): boolean {
  if (Array.isArray(p.github) && p.github.length > 0) return true;
  const overlayPath = join(repoRoot, "data", "overlays", `${p.slug}.json`);
  if (!existsSync(overlayPath)) return false;
  try {
    const overlay = JSON.parse(readFileSync(overlayPath, "utf8")) as { github?: string[] | null };
    return Array.isArray(overlay.github) && overlay.github.length > 0;
  } catch {
    return false;
  }
}

function hasAudits(repoRoot: string, slug: string): boolean {
  const path = join(repoRoot, "data", "enrichment", slug, "audits.json");
  if (!existsSync(path)) return false;
  try {
    const json = JSON.parse(readFileSync(path, "utf8")) as { audits?: unknown[] };
    return Array.isArray(json.audits) && json.audits.length > 0;
  } catch {
    return false;
  }
}

interface FetchOutcome {
  ok: boolean;
  status: number;
  body: string;
  error?: string;
  finalUrl: string;
}

async function fetchHtml(url: string, timeoutMs: number): Promise<FetchOutcome> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "text/html,*/*" },
      redirect: "follow",
      signal: ctrl.signal,
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body, finalUrl: res.url || url };
  } catch (err) {
    return { ok: false, status: 0, body: "", error: (err as Error).message, finalUrl: url };
  } finally {
    clearTimeout(t);
  }
}

interface ScrapeResult {
  slug: string;
  website: string;
  status: "found" | "empty" | "no_website" | "fetch_failed";
  source_page: string | null;
  repos: ExtractedRepo[];
  http_status: number | null;
  error?: string;
}

/**
 * Build the candidate URL list to try for one protocol. DefiLlama frequently
 * lists the dApp URL (`app.foo.com`) which is an SPA shell with no useful
 * HTML. We try the listed website first, then heuristic fallbacks: the bare
 * root domain and a blind `docs.<root>` probe.
 */
function candidateUrls(website: string): string[] {
  const urls = [website];
  let parsed: URL;
  try {
    parsed = new URL(website);
  } catch {
    return urls;
  }
  const host = parsed.hostname;
  const root = extractRootHost(website);
  if (root && host !== root && host !== `www.${root}`) {
    urls.push(`https://${root}`);
  }
  if (root) {
    urls.push(`https://docs.${root}`);
  }
  return [...new Set(urls)];
}

async function scrapeOne(p: ProtocolSnapshot, timeoutMs: number): Promise<ScrapeResult> {
  if (!p.website) {
    return {
      slug: p.slug,
      website: "",
      status: "no_website",
      source_page: null,
      repos: [],
      http_status: null,
    };
  }
  const tried: string[] = [];
  let lastStatus = 0;
  let lastError: string | undefined;
  let lastFinalUrl = p.website;

  for (const url of candidateUrls(p.website)) {
    tried.push(url);
    const res = await fetchHtml(url, timeoutMs);
    lastStatus = res.status;
    lastError = res.error;
    lastFinalUrl = res.finalUrl;
    if (!res.ok) continue;
    const repos = extractGithubRepos(res.body);
    if (repos.length > 0) {
      return {
        slug: p.slug,
        website: p.website,
        status: "found",
        source_page: res.finalUrl,
        repos,
        http_status: res.status,
      };
    }
    // Walk one in-page docs link from this page if present.
    const host = extractRootHost(url);
    if (host) {
      const docsLink = findDocsLink(res.body, host);
      if (docsLink && !tried.includes(docsLink)) {
        tried.push(docsLink);
        const docs = await fetchHtml(docsLink, timeoutMs);
        if (docs.ok) {
          const fromDocs = extractGithubRepos(docs.body);
          if (fromDocs.length > 0) {
            return {
              slug: p.slug,
              website: p.website,
              status: "found",
              source_page: docs.finalUrl,
              repos: fromDocs,
              http_status: docs.status,
            };
          }
        }
      }
    }
  }

  // Nothing from any candidate. Distinguish "nothing in HTML" from "nothing
  // fetched at all" by checking lastStatus.
  if (lastStatus === 0) {
    return {
      slug: p.slug,
      website: p.website,
      status: "fetch_failed",
      source_page: lastFinalUrl,
      repos: [],
      http_status: 0,
      error: lastError,
    };
  }
  return {
    slug: p.slug,
    website: p.website,
    status: "empty",
    source_page: lastFinalUrl,
    repos: [],
    http_status: lastStatus,
  };
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, idx: number) => Promise<R>,
  onResult?: (r: R, idx: number) => void,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      const r = await fn(items[i]!, i);
      out[i] = r;
      onResult?.(r, i);
    }
  });
  await Promise.all(workers);
  return out;
}

function reposToUrls(repos: ExtractedRepo[]): string[] {
  return repos.map((r) => (r.repo ? `https://github.com/${r.org}/${r.repo}` : `https://github.com/${r.org}`));
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const snapshot = JSON.parse(
    readFileSync(join(opts.repoRoot, "data", "defillama-snapshot.json"), "utf8"),
  ) as Snapshot;

  const all = Object.values(snapshot.protocols);
  let candidates: ProtocolSnapshot[];
  if (opts.slug) {
    candidates = all.filter((p) => p.slug === opts.slug);
  } else {
    candidates = all
      .filter(isActive)
      .filter((p) => !hasGithub(p, opts.repoRoot))
      .filter((p) => (p.tvl ?? 0) >= opts.minTvl)
      .filter((p) => (opts.onlyWithAudits ? hasAudits(opts.repoRoot, p.slug) : true));
    candidates.sort((a, b) => (b.tvl ?? -1) - (a.tvl ?? -1));
  }

  if (candidates.length === 0) {
    console.error(`[scrape-github] no candidates`);
    process.exit(1);
  }

  console.error(
    `[scrape-github] ${candidates.length} candidates · concurrency ${opts.concurrency} · timeout ${opts.timeoutMs}ms · ${opts.apply ? "APPLY" : "dry run"}`,
  );

  const logDir = join(opts.repoRoot, "data", "auditors");
  mkdirSync(logDir, { recursive: true });
  const logPath = join(logDir, "scrape-github.log.jsonl");
  // Truncate the log on each run so it always reflects the latest pass.
  writeFileSync(logPath, "");

  const overlayDir = join(opts.repoRoot, "data", "overlays");
  if (opts.apply) mkdirSync(overlayDir, { recursive: true });

  let nFound = 0;
  let nEmpty = 0;
  let nFailed = 0;
  let nNoWebsite = 0;
  let nWritten = 0;
  let nSkipped = 0;
  let nDone = 0;

  const results = await runWithConcurrency(
    candidates,
    opts.concurrency,
    (p) => scrapeOne(p, opts.timeoutMs),
    (r) => {
      nDone++;
      if (r.status === "found") nFound++;
      else if (r.status === "empty") nEmpty++;
      else if (r.status === "fetch_failed") nFailed++;
      else if (r.status === "no_website") nNoWebsite++;
      appendFileSync(logPath, `${JSON.stringify(r)}\n`);
      if (nDone % 50 === 0) {
        console.error(
          `[scrape-github]   progress ${nDone}/${candidates.length} — found=${nFound} empty=${nEmpty} failed=${nFailed} no_site=${nNoWebsite}`,
        );
      }
    },
  );

  if (opts.apply) {
    for (const r of results) {
      if (r.status !== "found" || r.repos.length === 0) continue;
      const path = join(overlayDir, `${r.slug}.json`);
      let overlay: Record<string, unknown> = {};
      if (existsSync(path)) {
        try {
          overlay = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
        } catch {
          // overwrite a corrupt overlay
        }
      }
      if (Array.isArray(overlay.github) && overlay.github.length > 0) {
        nSkipped++;
        continue;
      }
      overlay.github = reposToUrls(r.repos);
      writeFileSync(path, `${JSON.stringify(overlay, null, 2)}\n`);
      nWritten++;
    }
  }

  console.error(
    `[scrape-github] done: ${nFound} found, ${nEmpty} empty, ${nFailed} fetch-failed, ${nNoWebsite} no-website` +
      (opts.apply ? ` · ${nWritten} overlays written, ${nSkipped} skipped (already curated)` : ` · log → ${logPath}`),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
