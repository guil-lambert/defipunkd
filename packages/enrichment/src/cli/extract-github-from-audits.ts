#!/usr/bin/env node
/**
 * defipunkd-extract-github-from-audits
 *
 * Tier 3 of the github-recovery pipeline. For every active protocol with no
 * github (in either snapshot or overlay) and at least one PDF audit
 * reference, download the audit PDFs, extract text from the first few pages
 * with `pdftotext`, and grep for `github.com/<org>/<repo>` URLs. The first
 * page or two of every Trail of Bits / Spearbit / Sherlock report cites the
 * exact repo + commit audited, so this is ground-truth.
 *
 * PDFs are cached under `.cache/audit-pdfs/<sha256>.{pdf,txt}` keyed by URL
 * hash so re-runs are cheap. Concurrency is capped at 4 because each slug
 * may pull several PDFs and we don't want to hammer GitHub raw.
 *
 * Requires: `pdftotext` on PATH (brew install poppler).
 *
 * Usage:
 *   pnpm --filter @defipunkd/enrichment exec tsx src/cli/extract-github-from-audits.ts
 *   pnpm --filter @defipunkd/enrichment exec tsx src/cli/extract-github-from-audits.ts --apply
 *   pnpm --filter @defipunkd/enrichment exec tsx src/cli/extract-github-from-audits.ts --slug paxos-gold --apply
 *
 * Flags:
 *   --apply             write overlay files (default dry-run)
 *   --slug <s>          single slug
 *   --min-tvl <n>       skip protocols below this TVL
 *   --concurrency <n>   parallel slugs (default 4)
 *   --max-audits <n>    max PDFs to try per slug (default 3, oldest skipped)
 *   --pages <n>         pdftotext page range, default 20 (scope sections are
 *                       usually 5-15 pages in; cover-only catches ~20% of repos)
 *   --timeout-ms <n>    per-PDF download timeout, default 30000
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

import type { ProtocolSnapshot, Snapshot } from "@defipunkd/registry";

import {
  extractGithubRepos,
  type ExtractedRepo,
} from "../scrape-github-from-html.js";

const UA = "defipunkd-audit-pdf-fetcher/0.1 (+https://github.com/guil-lambert/defipunkd)";

interface CliOptions {
  apply: boolean;
  slug: string | null;
  minTvl: number;
  concurrency: number;
  maxAudits: number;
  pages: number;
  timeoutMs: number;
  repoRoot: string;
}

interface AuditFileEntry {
  firm: string | null;
  url: string;
  date: string | null;
  source: "defillama" | "auditor-repo";
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
  let apply = false;
  let slug: string | null = null;
  let minTvl = 0;
  let concurrency = 4;
  let maxAudits = 3;
  let pages = 20;
  let timeoutMs = 30_000;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") apply = true;
    else if (a === "--slug") slug = argv[++i] ?? null;
    else if (a?.startsWith("--slug=")) slug = a.slice("--slug=".length);
    else if (a === "--min-tvl") minTvl = Number(argv[++i] ?? 0);
    else if (a === "--concurrency") concurrency = Number(argv[++i] ?? 4);
    else if (a === "--max-audits") maxAudits = Number(argv[++i] ?? 3);
    else if (a === "--pages") pages = Number(argv[++i] ?? 3);
    else if (a === "--timeout-ms") timeoutMs = Number(argv[++i] ?? 30_000);
  }
  return {
    apply,
    slug,
    minTvl: Number.isFinite(minTvl) ? minTvl : 0,
    concurrency: Math.max(1, Math.min(16, concurrency)),
    maxAudits: Math.max(1, maxAudits),
    pages: Math.max(1, Math.min(20, pages)),
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

function loadAudits(repoRoot: string, slug: string): AuditFileEntry[] {
  const path = join(repoRoot, "data", "enrichment", slug, "audits.json");
  if (!existsSync(path)) return [];
  try {
    const json = JSON.parse(readFileSync(path, "utf8")) as { audits?: AuditFileEntry[] };
    return json.audits ?? [];
  } catch {
    return [];
  }
}

/**
 * Convert a github.com /blob/ URL into a raw.githubusercontent.com URL so we
 * download the file bytes directly instead of GitHub's HTML viewer wrapper.
 * URLs that are already raw or non-github pass through unchanged.
 */
function toRawUrl(url: string): string {
  const blob = url.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/,
  );
  if (blob) {
    return `https://raw.githubusercontent.com/${blob[1]}/${blob[2]}/${blob[3]}/${blob[4]}`;
  }
  return url;
}

function isPdfUrl(url: string): boolean {
  // Strip query/hash for the extension check.
  return /\.pdf(?:[?#]|$)/i.test(url);
}

async function fetchPdfWithCache(
  url: string,
  cacheDir: string,
  timeoutMs: number,
): Promise<{ ok: true; pdfPath: string } | { ok: false; error: string }> {
  const hash = createHash("sha256").update(url).digest("hex").slice(0, 24);
  const pdfPath = join(cacheDir, `${hash}.pdf`);
  if (existsSync(pdfPath)) return { ok: true, pdfPath };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(toRawUrl(url), {
      headers: { "User-Agent": UA },
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false, error: `http ${res.status}` };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000) return { ok: false, error: `body too small (${buf.length}B)` };
    if (!buf.subarray(0, 4).toString("ascii").startsWith("%PDF")) {
      return { ok: false, error: "not a PDF (no %PDF magic)" };
    }
    writeFileSync(pdfPath, buf);
    return { ok: true, pdfPath };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  } finally {
    clearTimeout(t);
  }
}

function pdfToText(pdfPath: string, pages: number): { ok: true; text: string } | { ok: false; error: string } {
  // Cache key includes the page count so bumping --pages invalidates old
  // truncated extractions automatically.
  const txtPath = `${pdfPath}.p${pages}.txt`;
  if (existsSync(txtPath)) {
    return { ok: true, text: readFileSync(txtPath, "utf8") };
  }
  try {
    // -l N stops after page N. -layout preserves spatial layout which keeps
    // URLs intact (otherwise pdftotext sometimes splits long URLs across
    // line wraps in raw mode).
    execFileSync("pdftotext", ["-layout", "-l", String(pages), pdfPath, txtPath], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    return { ok: true, text: readFileSync(txtPath, "utf8") };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

interface SlugResult {
  slug: string;
  status: "found" | "no_pdfs" | "all_failed" | "empty";
  repos: ExtractedRepo[];
  source_url: string | null;
  attempts: Array<{ url: string; outcome: string }>;
}

async function processSlug(
  p: ProtocolSnapshot,
  audits: AuditFileEntry[],
  cacheDir: string,
  opts: CliOptions,
): Promise<SlugResult> {
  // Newest audits first — they reference the most current repo.
  const candidates = audits
    .filter((a) => isPdfUrl(a.url))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, opts.maxAudits);

  if (candidates.length === 0) {
    return { slug: p.slug, status: "no_pdfs", repos: [], source_url: null, attempts: [] };
  }

  const attempts: SlugResult["attempts"] = [];
  for (const audit of candidates) {
    const fetched = await fetchPdfWithCache(audit.url, cacheDir, opts.timeoutMs);
    if (!fetched.ok) {
      attempts.push({ url: audit.url, outcome: `fetch:${fetched.error}` });
      continue;
    }
    const text = pdfToText(fetched.pdfPath, opts.pages);
    if (!text.ok) {
      attempts.push({ url: audit.url, outcome: `pdftotext:${text.error}` });
      continue;
    }
    const repos = extractGithubRepos(text.text);
    if (repos.length > 0) {
      attempts.push({ url: audit.url, outcome: `found:${repos.length}` });
      return {
        slug: p.slug,
        status: "found",
        repos,
        source_url: audit.url,
        attempts,
      };
    }
    attempts.push({ url: audit.url, outcome: "no-github-on-pages" });
  }

  // Distinguish "all PDFs unfetchable" from "we read text but found nothing".
  const allFailed = attempts.every((a) => a.outcome.startsWith("fetch:") || a.outcome.startsWith("pdftotext:"));
  return {
    slug: p.slug,
    status: allFailed ? "all_failed" : "empty",
    repos: [],
    source_url: null,
    attempts,
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

  // Sanity-check pdftotext availability up front.
  try {
    execFileSync("pdftotext", ["-v"], { stdio: ["ignore", "ignore", "pipe"] });
  } catch {
    console.error("[extract-github-from-audits] pdftotext not found on PATH. Install with: brew install poppler");
    process.exit(2);
  }

  const snapshot = JSON.parse(
    readFileSync(join(opts.repoRoot, "data", "defillama-snapshot.json"), "utf8"),
  ) as Snapshot;

  const all = Object.values(snapshot.protocols);
  let candidates: Array<{ p: ProtocolSnapshot; audits: AuditFileEntry[] }>;
  if (opts.slug) {
    candidates = all
      .filter((p) => p.slug === opts.slug)
      .map((p) => ({ p, audits: loadAudits(opts.repoRoot, p.slug) }));
  } else {
    candidates = all
      .filter(isActive)
      .filter((p) => !hasGithub(p, opts.repoRoot))
      .filter((p) => (p.tvl ?? 0) >= opts.minTvl)
      .map((p) => ({ p, audits: loadAudits(opts.repoRoot, p.slug) }))
      .filter(({ audits }) => audits.some((a) => isPdfUrl(a.url)));
    candidates.sort((a, b) => (b.p.tvl ?? -1) - (a.p.tvl ?? -1));
  }

  if (candidates.length === 0) {
    console.error("[extract-github-from-audits] no candidates");
    process.exit(1);
  }

  const cacheDir = join(opts.repoRoot, ".cache", "audit-pdfs");
  mkdirSync(cacheDir, { recursive: true });

  const logDir = join(opts.repoRoot, "data", "auditors");
  mkdirSync(logDir, { recursive: true });
  const logPath = join(logDir, "extract-github-from-audits.log.jsonl");
  writeFileSync(logPath, "");

  const overlayDir = join(opts.repoRoot, "data", "overlays");
  if (opts.apply) mkdirSync(overlayDir, { recursive: true });

  console.error(
    `[extract-github-from-audits] ${candidates.length} candidates · concurrency ${opts.concurrency} · pages ${opts.pages} · cache ${cacheDir} · ${opts.apply ? "APPLY" : "dry run"}`,
  );

  let nFound = 0;
  let nEmpty = 0;
  let nAllFailed = 0;
  let nDone = 0;

  const results = await runWithConcurrency(
    candidates,
    opts.concurrency,
    ({ p, audits }) => processSlug(p, audits, cacheDir, opts),
    (r) => {
      nDone++;
      if (r.status === "found") nFound++;
      else if (r.status === "empty") nEmpty++;
      else if (r.status === "all_failed") nAllFailed++;
      appendFileSync(logPath, `${JSON.stringify(r)}\n`);
      if (nDone % 25 === 0) {
        console.error(
          `[extract-github-from-audits]   progress ${nDone}/${candidates.length} — found=${nFound} empty=${nEmpty} all_failed=${nAllFailed}`,
        );
      }
    },
  );

  let nWritten = 0;
  let nSkipped = 0;
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
    `[extract-github-from-audits] done: ${nFound} found, ${nEmpty} read-but-empty, ${nAllFailed} all-pdfs-failed` +
      (opts.apply ? ` · ${nWritten} overlays written, ${nSkipped} skipped (already curated)` : ` · log → ${logPath}`),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
