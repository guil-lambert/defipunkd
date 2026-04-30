/**
 * Audit-aggregator fan-out.
 *
 * Many protocols publish audits via a github repo of their own (e.g.
 * `github.com/lidofinance/audits`, `github.com/aave/audits`). Defillama
 * stores those repos as a single entry in `audit_links`, which means our
 * extracted `audits.json` ends up with one row pointing at the index page
 * instead of one row per audit. This module fans those repos out by
 * listing their tree via the GitHub API and emitting one audit entry per
 * .pdf file we find inside.
 *
 * Firm + date are parsed heuristically from the filename ("Certora Lido V3
 * Audit Report - 12-2025.pdf" → firm="Certora", date="2025-12"). When we
 * cannot parse one with confidence we leave it null rather than guessing.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const CACHE_SUBDIR = join(".cache", "audit-aggregator");
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Matches the canonical "<org>/audits"-style aggregator repo at the root.
const AGGREGATOR_REPO_RE =
  /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/(audits?|security|audit-reports?|security-audits?)\/?$/i;

// Matches an audit-like sub-directory inside a regular repo, e.g.
// `github.com/Uniswap/v4-core/tree/main/docs/security/audits`. The path
// segment list must end with an audit-shaped folder name to qualify.
const AGGREGATOR_SUBDIR_RE =
  /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+?)\/?$/i;
const AUDIT_FOLDER_RE = /(?:^|\/)(audits?|security|audit-reports?|security-audits?)\/?$/i;

export interface AggregatorAudit {
  firm: string | null;
  url: string;
  date: string | null;
  source: "github-aggregator";
  raw_name: string;
}

export interface AggregatorTarget {
  owner: string;
  repo: string;
  /** When set, only files under this path inside the repo are considered. */
  subdir: string | null;
  /** Branch override from the URL (only set for tree URLs); else use repo default. */
  branch: string | null;
}

export function isAggregatorUrl(url: string): AggregatorTarget | null {
  const top = url.match(AGGREGATOR_REPO_RE);
  if (top) return { owner: top[1]!, repo: top[2]!, subdir: null, branch: null };

  const sub = url.match(AGGREGATOR_SUBDIR_RE);
  if (sub && AUDIT_FOLDER_RE.test(sub[4]!)) {
    return { owner: sub[1]!, repo: sub[2]!, branch: sub[3]!, subdir: sub[4]!.replace(/\/$/, "") };
  }
  return null;
}

interface CachedTree {
  fetched_at: number;
  default_branch: string;
  paths: string[];
}

function cacheKey(owner: string, repo: string, branch: string | null): string {
  const k = branch ? `${owner}/${repo}@${branch}` : `${owner}/${repo}`;
  return createHash("sha256").update(k).digest("hex");
}

function readCache(repoRoot: string, owner: string, repo: string, branch: string | null): CachedTree | null {
  const path = join(repoRoot, CACHE_SUBDIR, `${cacheKey(owner, repo, branch)}.json`);
  if (!existsSync(path)) return null;
  try {
    const c = JSON.parse(readFileSync(path, "utf8")) as CachedTree;
    if (Date.now() - c.fetched_at > CACHE_TTL_MS) return null;
    return c;
  } catch {
    return null;
  }
}

function writeCache(repoRoot: string, owner: string, repo: string, branch: string | null, c: CachedTree): void {
  const path = join(repoRoot, CACHE_SUBDIR, `${cacheKey(owner, repo, branch)}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(c, null, 2));
}

async function ghFetch(url: string): Promise<Response> {
  const headers: Record<string, string> = {
    "User-Agent": "defipunkd/audit-aggregator",
    Accept: "application/vnd.github+json",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return fetch(url, { headers });
}

async function listRepoTree(
  owner: string,
  repo: string,
  branchOverride: string | null,
): Promise<{ default_branch: string; paths: string[] } | null> {
  let branch = branchOverride;
  if (!branch) {
    // Resolve default branch first so we don't blindly assume "main".
    const repoRes = await ghFetch(`https://api.github.com/repos/${owner}/${repo}`);
    if (!repoRes.ok) {
      if (repoRes.status === 404) return null;
      throw new Error(`GitHub repo ${owner}/${repo}: HTTP ${repoRes.status}`);
    }
    const repoMeta = (await repoRes.json()) as { default_branch?: string };
    branch = repoMeta.default_branch ?? "main";
  }

  const treeRes = await ghFetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
  );
  if (!treeRes.ok) {
    throw new Error(`GitHub tree ${owner}/${repo}@${branch}: HTTP ${treeRes.status}`);
  }
  const tree = (await treeRes.json()) as { tree?: Array<{ type: string; path: string }>; truncated?: boolean };
  const paths = (tree.tree ?? [])
    .filter((n) => n.type === "blob")
    .map((n) => n.path);
  return { default_branch: branch, paths };
}

function looksLikeAuditFile(p: string): boolean {
  if (!/\.pdf$/i.test(p)) return false;
  const base = p.split("/").pop()!;
  if (/^README/i.test(base)) return false;
  if (/^CONTRIBUTING/i.test(base)) return false;
  if (/^LICENSE/i.test(base)) return false;
  return true;
}

// Known audit firms whose names appear in protocol-aggregator filenames.
// Order matters: longer/more-specific names first so multi-word firms (e.g.
// "Trail of Bits") match before a substring like "Bits" would.
const KNOWN_FIRMS: { pattern: RegExp; label: string }[] = [
  { pattern: /\btrail[\s_-]?of[\s_-]?bits\b/i, label: "Trail of Bits" },
  { pattern: /\backee[\s_-]?blockchain\b/i, label: "Ackee Blockchain" },
  { pattern: /\bconsensys[\s_-]?diligence\b/i, label: "ConsenSys Diligence" },
  { pattern: /\bruntime[\s_-]?verification\b/i, label: "Runtime Verification" },
  { pattern: /\bsigma[\s_-]?prime\b/i, label: "Sigma Prime" },
  { pattern: /\bopen[\s_-]?zeppelin\b/i, label: "OpenZeppelin" },
  { pattern: /\bchain[\s_-]?security\b/i, label: "ChainSecurity" },
  { pattern: /\bmix[\s_-]?bytes\b/i, label: "MixBytes" },
  { pattern: /\bcode[\s_-]?423?n4\b/i, label: "Code4rena" },
  { pattern: /\bcode4rena\b/i, label: "Code4rena" },
  { pattern: /\bpeck[\s_-]?shield\b/i, label: "PeckShield" },
  { pattern: /\bspearbit\b/i, label: "Spearbit" },
  { pattern: /\bcantina\b/i, label: "Cantina" },
  { pattern: /\bcertora\b/i, label: "Certora" },
  { pattern: /\bquantstamp\b/i, label: "Quantstamp" },
  { pattern: /\bsherlock\b/i, label: "Sherlock" },
  { pattern: /\bhalborn\b/i, label: "Halborn" },
  { pattern: /\bhexens\b/i, label: "Hexens" },
  { pattern: /\bzellic\b/i, label: "Zellic" },
  { pattern: /\bstatemind\b/i, label: "Statemind" },
  { pattern: /\boxorio\b/i, label: "Oxorio" },
  { pattern: /\babdk\b/i, label: "ABDK" },
  { pattern: /\bcoinspect\b/i, label: "Coinspect" },
  { pattern: /\bimmune[\s_-]?bytes\b/i, label: "ImmuneBytes" },
  { pattern: /\bcomposable[\s_-]?security\b/i, label: "Composable Security" },
  { pattern: /\bdedaub\b/i, label: "Dedaub" },
  { pattern: /\bnethermind\b/i, label: "Nethermind" },
  { pattern: /\bofficer[\s_-]?cia\b/i, label: "OfficerCIA" },
  { pattern: /\bpessimistic\b/i, label: "Pessimistic" },
  { pattern: /\bverilog\b/i, label: "Verilog Solutions" },
  { pattern: /\bqsp\b/i, label: "Quantstamp" },
  { pattern: /\bsec3\b/i, label: "Sec3" },
  { pattern: /\bblockaid\b/i, label: "Blockaid" },
];

function parseFirmAndDate(filename: string): { firm: string | null; date: string | null } {
  const stem = decodeURIComponent(filename)
    .replace(/\.[^./]+$/, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Date: most specific first.
  let date: string | null = null;
  const ymd = stem.match(/(20\d{2})[\s.\-_]?(0[1-9]|1[0-2])[\s.\-_]?(0[1-9]|[12]\d|3[01])\b/);
  const ym = stem.match(/(20\d{2})[\s.\-_]?(0[1-9]|1[0-2])\b/);
  const my = stem.match(/\b(0[1-9]|1[0-2])[\s.\-_](20\d{2})\b/);
  if (ymd) {
    date = `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  } else if (ym) {
    date = `${ym[1]}-${ym[2]}`;
  } else if (my) {
    date = `${my[2]}-${my[1]}`;
  }

  // Firm: scan the whole filename for known firm names. This handles the
  // common `<scope>-<date>-<firm>-<rest>` layout used by Lido/Aave/etc.
  // aggregator repos where the firm is not the leading token.
  for (const { pattern, label } of KNOWN_FIRMS) {
    if (pattern.test(stem)) return { firm: label, date };
  }

  // Fallback: leading capitalized run before an audit/security keyword.
  const splitMatch = stem.split(/\b(?:audit|security|review|report|assessment)\b/i);
  let head = splitMatch[0]?.trim() ?? "";
  head = head.replace(/(?:20\d{2})[-./_]?(?:\d{2})?[-./_]?(?:\d{2})?/g, " ");
  head = head.replace(/[\-_/]+/g, " ").replace(/\s+/g, " ").trim();
  const tokens = head.split(/\s+/).filter((t) => /^[A-Za-z][A-Za-z0-9&]*$/.test(t));
  const firmTokens: string[] = [];
  for (const t of tokens) {
    if (!/^[A-Z]/.test(t)) break;
    firmTokens.push(t);
    if (firmTokens.length >= 3) break;
  }
  const firm = firmTokens.length > 0 ? firmTokens.join(" ") : null;

  return { firm, date };
}

export interface ExpandResult {
  audits: AggregatorAudit[];
  default_branch: string;
}

export async function expandAggregator(
  url: string,
  opts: { repoRoot: string; force?: boolean },
): Promise<ExpandResult | null> {
  const m = isAggregatorUrl(url);
  if (!m) return null;

  let cached = opts.force ? null : readCache(opts.repoRoot, m.owner, m.repo, m.branch);
  if (!cached) {
    const tree = await listRepoTree(m.owner, m.repo, m.branch);
    if (!tree) return { audits: [], default_branch: m.branch ?? "main" };
    cached = { fetched_at: Date.now(), default_branch: tree.default_branch, paths: tree.paths };
    writeCache(opts.repoRoot, m.owner, m.repo, m.branch, cached);
  }

  const audits: AggregatorAudit[] = [];
  const subdirPrefix = m.subdir ? `${m.subdir}/` : "";
  for (const p of cached.paths) {
    // Subdir-scoped aggregator? Only consider files inside the directory.
    if (subdirPrefix && !p.startsWith(subdirPrefix)) continue;
    if (!looksLikeAuditFile(p)) continue;
    const filename = p.split("/").pop()!;
    const { firm, date } = parseFirmAndDate(filename);
    audits.push({
      firm,
      date,
      url: `https://github.com/${m.owner}/${m.repo}/blob/${cached.default_branch}/${p
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`,
      source: "github-aggregator",
      raw_name: filename.replace(/\.pdf$/i, ""),
    });
  }

  return { audits, default_branch: cached.default_branch };
}
