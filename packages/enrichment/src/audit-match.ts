/**
 * Token-based fuzzy matcher between auditor-published reports and protocols.
 *
 * Reports are tokenized once at indexing time; protocols are tokenized at
 * match time using both their slug and display name. A match requires at
 * least one shared non-stop token of length ≥ 4 — short tokens like "v2",
 * "01", or "uni" are too noisy to anchor a match by themselves.
 *
 * Pure functions — covered by unit tests.
 */

/** Generic noise tokens that show up in too many protocol/audit names to be discriminative. */
const STOP_TOKENS = new Set([
  "protocol", "finance", "network", "labs", "lab", "dao", "foundation",
  "the", "of", "and", "for", "by",
  "security", "review", "audit", "audits", "report", "reports", "final", "draft",
  "contest", "findings", "competition",
  "v1", "v2", "v3", "v4", "v5",
  "io", "xyz", "fi", "co", "com",
  "smart", "contract", "contracts",
  "defi", "crypto",
]);

const MIN_STRONG_TOKEN_LEN = 4;

export function tokenize(input: string): string[] {
  if (!input) return [];
  const lowered = input.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
  const raw = lowered.split(/[^a-z0-9]+/).filter(Boolean);
  const out = new Set<string>();
  for (const t of raw) {
    if (t.length < 3) continue;
    if (STOP_TOKENS.has(t)) continue;
    out.add(t);
  }
  return [...out];
}

export interface MatchInput {
  slug: string;
  name: string;
}

export interface AuditTokens {
  tokens: string[];
}

/**
 * Returns true when the protocol and audit share at least one non-stop token
 * of length ≥ 4. Short tokens are required to match exactly via the same
 * tokenization but, on their own, are not sufficient to anchor a match.
 */
export function isMatch(protocol: MatchInput, audit: AuditTokens): boolean {
  const protoTokens = new Set([...tokenize(protocol.slug), ...tokenize(protocol.name)]);
  if (protoTokens.size === 0) return false;
  const auditSet = new Set(audit.tokens);
  for (const t of protoTokens) {
    if (t.length >= MIN_STRONG_TOKEN_LEN && auditSet.has(t)) return true;
  }
  return false;
}

/** Infer auditor firm from a URL host. Returns null when nothing recognizable. */
export function firmFromUrl(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host.includes("openzeppelin.com")) return "OpenZeppelin";
  if (host.includes("trailofbits") || host.endsWith("trail-of-bits.com")) return "Trail of Bits";
  if (host.includes("spearbit")) return "Spearbit";
  if (host.includes("cantina.xyz")) return "Cantina";
  if (host.includes("code4rena.com") || host.includes("code-423n4")) return "Code4rena";
  if (host.includes("sherlock.xyz") || host.includes("sherlock-protocol")) return "Sherlock";
  if (host.includes("certora.com")) return "Certora";
  if (host.includes("quantstamp.com")) return "Quantstamp";
  if (host.includes("halborn.com")) return "Halborn";
  if (host.includes("peckshield")) return "PeckShield";
  if (host.includes("chainsecurity")) return "ChainSecurity";
  if (host.includes("zellic")) return "Zellic";
  if (host.includes("ackeeblockchain") || host.includes("ackee.")) return "Ackee Blockchain";
  if (host.includes("consensys")) return "ConsenSys Diligence";
  if (host.includes("sigmaprime") || host.includes("sigp.io")) return "Sigma Prime";
  if (host.includes("mixbytes")) return "MixBytes";
  if (host.includes("hacken")) return "Hacken";
  if (host.includes("runtimeverification")) return "Runtime Verification";
  if (host.includes("github.com")) {
    // GitHub-hosted PDFs sometimes encode the firm in the path.
    if (url.includes("/trailofbits/")) return "Trail of Bits";
    if (url.includes("/spearbit/")) return "Spearbit";
    if (url.includes("/sherlock-protocol/")) return "Sherlock";
    if (url.includes("/code-423n4/")) return "Code4rena";
    if (url.includes("/OpenZeppelin/")) return "OpenZeppelin";
  }
  return null;
}

const MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04",
  may: "05", june: "06", july: "07", august: "08",
  september: "09", october: "10", november: "11", december: "12",
  jan: "01", feb: "02", mar: "03", apr: "04",
  jun: "06", jul: "07", aug: "08", sep: "09", sept: "09",
  oct: "10", nov: "11", dec: "12",
};

export function monthNameToNum(name: string): string | null {
  return MONTHS[name.toLowerCase()] ?? null;
}
