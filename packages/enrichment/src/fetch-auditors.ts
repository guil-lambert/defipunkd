/**
 * Auditor-side crawlers.
 *
 * Each function pulls a public listing of audit reports from a single firm's
 * GitHub repo and returns normalized {firm, url, date, raw_name, tokens}
 * records. Networking errors surface as warnings so the caller can keep
 * partial results.
 *
 * GitHub API:
 *   - Contents API for known directories: 60 req/hr unauth, 5000/hr with token
 *     via GITHUB_TOKEN env var (read in cli/index-auditors.ts and threaded in).
 *   - Org repos API for Code4rena, paginated.
 */

import type { FetchFn } from "./fetch-etherscan.js";
import { monthNameToNum, tokenize } from "./audit-match.js";

export interface AuditorEntry {
  firm: string;
  url: string;
  /** YYYY-MM or YYYY-MM-DD when extractable, else null. */
  date: string | null;
  raw_name: string;
  tokens: string[];
}

export interface CrawlResult {
  entries: AuditorEntry[];
  warnings: string[];
}

interface GhContent {
  name: string;
  path: string;
  type: string;
  html_url: string | null;
  download_url: string | null;
}

interface GhRepo {
  name: string;
  html_url: string;
  archived?: boolean;
}

export interface CrawlOptions {
  fetch: FetchFn;
  token?: string;
}

function ghHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "defipunkd-enrichment",
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function ghJson<T>(
  url: string,
  opts: CrawlOptions,
): Promise<{ ok: boolean; status: number; body: T | null; warning: string | null }> {
  let res: Awaited<ReturnType<FetchFn>>;
  try {
    // FetchFn doesn't carry headers in its current signature — wrap a real fetch directly.
    const realRes = await fetch(url, { headers: ghHeaders(opts.token) });
    res = {
      ok: realRes.ok,
      status: realRes.status,
      json: () => realRes.json(),
    };
  } catch (err) {
    return { ok: false, status: 0, body: null, warning: `fetch failed: ${(err as Error).message}` };
  }
  if (!res.ok) {
    return { ok: false, status: res.status, body: null, warning: `http ${res.status} for ${url}` };
  }
  try {
    return { ok: true, status: res.status, body: (await res.json()) as T, warning: null };
  } catch (err) {
    return { ok: false, status: res.status, body: null, warning: `non-json: ${(err as Error).message}` };
  }
}

async function listDir(
  owner: string,
  repo: string,
  path: string,
  opts: CrawlOptions,
): Promise<{ items: GhContent[]; warnings: string[] }> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const r = await ghJson<GhContent[]>(url, opts);
  if (!r.ok || !r.body) return { items: [], warnings: [r.warning ?? "unknown error"] };
  return { items: r.body, warnings: [] };
}

/** Trail of Bits: filenames like `2025-06-reserveprotocol-solidity400-securityreview.pdf`. */
export async function crawlTrailOfBits(opts: CrawlOptions): Promise<CrawlResult> {
  const { items, warnings } = await listDir("trailofbits", "publications", "reviews", opts);
  const entries: AuditorEntry[] = [];
  for (const it of items) {
    if (it.type !== "file" || !/\.pdf$/i.test(it.name)) continue;
    const m = it.name.match(/^(\d{4})-(\d{2})-(.+?)-?securityreview\.pdf$/i);
    let date: string | null = null;
    let core = it.name.replace(/\.pdf$/i, "");
    if (m) {
      date = `${m[1]}-${m[2]}`;
      core = m[3]!;
    }
    entries.push({
      firm: "Trail of Bits",
      url: it.html_url ?? `https://github.com/trailofbits/publications/blob/master/reviews/${it.name}`,
      date,
      raw_name: core,
      tokens: tokenize(core),
    });
  }
  return { entries, warnings };
}

/** Spearbit: `{Protocol}-Spearbit-Security-Review-{Month}-{Year}.pdf`. */
export async function crawlSpearbit(opts: CrawlOptions): Promise<CrawlResult> {
  const { items, warnings } = await listDir("spearbit", "portfolio", "pdfs", opts);
  const entries: AuditorEntry[] = [];
  for (const it of items) {
    if (it.type !== "file" || !/\.pdf$/i.test(it.name)) continue;
    const base = it.name.replace(/\.pdf$/i, "");
    let date: string | null = null;
    let core = base;
    const m = base.match(/^(.+?)-Spearbit-Security-Review-([A-Za-z]+)-(\d{4})$/i);
    if (m) {
      const mm = monthNameToNum(m[2]!);
      if (mm) date = `${m[3]}-${mm}`;
      core = m[1]!;
    }
    entries.push({
      firm: "Spearbit",
      url: it.html_url ?? `https://github.com/spearbit/portfolio/blob/master/pdfs/${it.name}`,
      date,
      raw_name: core,
      tokens: tokenize(core),
    });
  }
  return { entries, warnings };
}

/**
 * Sherlock: `YYYY.MM.DD – Final – {Protocol} – {Type} Audit Report.pdf`.
 * Note: separator is U+2013 (en-dash), not ASCII hyphen.
 */
export async function crawlSherlock(opts: CrawlOptions): Promise<CrawlResult> {
  const { items, warnings } = await listDir("sherlock-protocol", "sherlock-reports", "audits", opts);
  const entries: AuditorEntry[] = [];
  for (const it of items) {
    if (it.type !== "file" || !/\.pdf$/i.test(it.name)) continue;
    const base = it.name.replace(/\.pdf$/i, "");
    // Observed shapes (separator may be en-dash U+2013 or ASCII hyphen):
    //   "YYYY.MM.DD - Final - {Name} Collaborative Audit Report {trailingNum}"
    //   "YYYY.MM.DD - Final - {Name} - {Type} Audit Report"
    //   "YYYY.MM.DD - Update - {Name} Audit Report"
    let date: string | null = null;
    let core = base;
    const dateAndStage = base.match(/^(\d{4})[.\-](\d{2})[.\-](\d{2})\s*[–\-]\s*(?:Final|Update|Initial|Draft)\s*[–\-]\s*(.+)$/i);
    if (dateAndStage) {
      date = `${dateAndStage[1]}-${dateAndStage[2]}-${dateAndStage[3]}`;
      // Strip trailing "Audit Report …" plus any preceding type qualifier and
      // the inner-dash variant ("Name - Type Audit Report").
      core = dateAndStage[4]!
        .replace(/\s+\d+\s*$/, "") // trailing numeric id
        .replace(/\s+(?:Collaborative|Solo|Contest|Public|Private|Initial|Final)?\s*Audit\s+Report.*$/i, "")
        .replace(/\s*[–\-]\s*(?:Collaborative|Solo|Contest|Public|Private)?\s*$/i, "")
        .trim();
    }
    entries.push({
      firm: "Sherlock",
      url: it.html_url ?? `https://github.com/sherlock-protocol/sherlock-reports/blob/main/audits/${encodeURIComponent(it.name)}`,
      date,
      raw_name: core,
      tokens: tokenize(core),
    });
  }
  return { entries, warnings };
}

/** Code4rena: each contest is its own repo named `YYYY-MM-{protocol}` (sometimes with `-findings` suffix). */
export async function crawlCode4rena(opts: CrawlOptions): Promise<CrawlResult> {
  const entries: AuditorEntry[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  let page = 1;
  while (page < 50) {
    const url = `https://api.github.com/orgs/code-423n4/repos?per_page=100&page=${page}&type=public`;
    const r = await ghJson<GhRepo[]>(url, opts);
    if (!r.ok || !r.body) {
      warnings.push(r.warning ?? "code4rena listing failed");
      break;
    }
    if (r.body.length === 0) break;
    for (const repo of r.body) {
      if (seen.has(repo.name)) continue;
      seen.add(repo.name);
      const m = repo.name.match(/^(\d{4})-(\d{2})-(.+?)(?:-findings)?$/);
      if (!m) continue;
      const core = m[3]!;
      entries.push({
        firm: "Code4rena",
        url: repo.html_url,
        date: `${m[1]}-${m[2]}`,
        raw_name: core,
        tokens: tokenize(core),
      });
    }
    if (r.body.length < 100) break;
    page++;
  }
  return { entries, warnings };
}
