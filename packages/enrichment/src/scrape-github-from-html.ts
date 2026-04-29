/**
 * Pure helpers for extracting GitHub repository links from arbitrary HTML.
 *
 * The audit pipeline uses these to recover `github` fields for protocols where
 * DefiLlama's snapshot has it null. We deliberately avoid a full DOM parser —
 * the only signal we need is `href="https://github.com/<org>(/<repo>)?"` which
 * is unambiguous in HTML.
 *
 * Auditor / boilerplate orgs are filtered out: a "View our audit" footer link
 * to github.com/trailofbits is not the protocol's own repo.
 */

// Stop the URL at the first character that can't appear in an org or repo
// segment. `/` is a *terminator* for the lookahead, not a segment char,
// because we only ever capture two path segments — anything after the
// repo (e.g. `/blob/main/README.md`, `/pull/2`) should not extend the
// capture and must not prevent the regex from matching at all.
//
// Without this, URLs like `github.com/THORWallet/TGT-TITN-merge-contracts/pull/2`
// fail to match entirely because every backtracked candidate sees `/`
// next, and `/` was incorrectly treated as a segment-continuation char.
//
// The terminator class is also broader than a simple href-quote lookahead
// because github links show up inside JSON-in-HTML (e.g.
// `\"github\":\"https://github.com/paxosglobal\"`) where the terminator
// is a backslash.
const HREF_GITHUB_RE = /(?:https?:)?\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9_.-]*?)(?:\/([A-Za-z0-9][A-Za-z0-9_.-]*?))?(?=[^A-Za-z0-9_.\-]|$)/g;

const AUDITOR_ORGS = new Set([
  "trailofbits", "spearbit", "sherlock-protocol", "sherlock-audit",
  "code-423n4", "openzeppelin",
  "consensys", "consensysdiligence", "certora", "quantstamp", "halborn",
  "peckshield", "chainsecurity", "zellic", "ackeeblockchain", "hacken",
  "runtime-verification", "runtimeverification", "sigmaprime", "sigp",
  "mixbytes", "statemind",
  "cantinaxyz", "code4rena", "macrofeb", "macro",
  "guardianaudits", "guardian-audits",
  "pashov-audit-group", "pashov",
  "yacademy",
  "shieldify-security", "shieldify",
  "veridise",
  "blocksec", "blocksecteam",
  "extropy-io", "extropyio",
  "zenith-security",
  "nethermindeth",
  "shellboxes",
  "iosiro",
  "kupia-secure",
  "0xguard",
  "secureum",
  "least-authority",
  "leastauthority",
]);

const BOILERPLATE_ORGS = new Set([
  "github", "githubuniverse", "actions", "marketplace", "explore", "topics",
  "trending", "features", "pricing", "about", "site", "readme",
  "vercel", "nextjs", "facebook", "vuejs", "twbs", "tailwindlabs",
  "fortawesome", "fontawesome",
]);

// First path-segment slugs that GitHub itself reserves for site navigation,
// product pages, and chrome. Fetching a github.com page in HTML mode returns
// these as a header/footer/nav menu; without filtering they leak into
// extracted "repo" lists. Match what's actually visible on github.com.
const RESERVED_PATHS = new Set([
  "login", "signup", "join", "sponsors", "settings", "notifications",
  "issues", "pulls", "marketplace", "explore", "topics", "trending",
  "features", "pricing", "about", "blog", "site", "readme",
  "enterprise", "team", "security", "solutions", "partners",
  "resources", "customer-stories", "accelerator", "collections",
  "premium-support", "trust-center", "why-github", "mcp",
  "fluidicon.png", "apple-touch-icon.png", "manifest.json",
  "edu", "education", "students", "teachers",
  "advisories", "codespaces", "copilot", "actions",
  "open-source", "events", "newsroom", "stars",
]);

export interface ExtractedRepo {
  org: string;
  /** Null when only an org URL was seen. */
  repo: string | null;
}

export function extractGithubRepos(html: string): ExtractedRepo[] {
  const seen = new Map<string, ExtractedRepo>();
  for (const m of html.matchAll(HREF_GITHUB_RE)) {
    // Strip trailing period — pdftotext wraps URLs at sentence boundaries
    // and the regex's segment class includes `.`, so a trailing `.` from the
    // surrounding prose can leak into the capture (e.g. "trailofbits.").
    const org = m[1]!.replace(/\.+$/, "");
    if (!org) continue;
    let repo: string | null = m[2] ?? null;
    const orgLower = org.toLowerCase();
    if (RESERVED_PATHS.has(orgLower)) continue;
    if (BOILERPLATE_ORGS.has(orgLower)) continue;
    if (AUDITOR_ORGS.has(orgLower)) continue;
    if (repo) {
      // Strip common trailing decorations that the regex may have absorbed.
      repo = repo.replace(/[.,)]+$/, "");
      if (repo.endsWith(".git")) repo = repo.slice(0, -4);
      if (!repo) repo = null;
    }
    const key = repo ? `${org}/${repo}` : org;
    if (!seen.has(key)) seen.set(key, { org, repo });
  }
  return [...seen.values()];
}

/**
 * Find a "docs" / "developers" / gitbook link in the HTML so we can fall back
 * there when the main page has no GitHub references. Returns the first match.
 */
export function findDocsLink(html: string, baseHost: string): string | null {
  const candidates = [
    new RegExp(`https?:\\/\\/docs\\.[^"'\\s>]*${escapeHost(baseHost)}[^"'\\s>]*`, "i"),
    new RegExp(`https?:\\/\\/developers?\\.${escapeHost(baseHost)}[^"'\\s>]*`, "i"),
    /https?:\/\/[a-z0-9-]+\.gitbook\.io[^"'\s>]*/i,
    /https?:\/\/[a-z0-9-]+\.readthedocs\.io[^"'\s>]*/i,
    new RegExp(`https?:\\/\\/${escapeHost(baseHost)}\\/docs[^"'\\s>]*`, "i"),
  ];
  for (const re of candidates) {
    const m = html.match(re);
    if (m) return m[0];
  }
  return null;
}

function escapeHost(host: string): string {
  return host.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

export function extractRootHost(url: string): string | null {
  try {
    const u = new URL(url);
    const parts = u.hostname.split(".");
    if (parts.length < 2) return u.hostname;
    return parts.slice(-2).join(".");
  } catch {
    return null;
  }
}
