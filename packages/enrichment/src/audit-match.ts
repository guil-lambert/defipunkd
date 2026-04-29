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
  // Generic suffixes / corporate.
  "protocol", "finance", "network", "labs", "lab", "dao", "foundation",
  "the", "of", "and", "for", "by", "with",
  "security", "review", "audit", "audits", "report", "reports", "final", "draft",
  "contest", "findings", "competition",
  "v1", "v2", "v3", "v4", "v5",
  "io", "xyz", "fi", "co", "com",
  "smart", "contract", "contracts",
  "defi", "crypto", "web3",
  // DeFi product-category words. These tokenize too many protocol names to
  // anchor a match on their own (e.g. "bridge" matches every bridge audit
  // against every bridge protocol). Removing them forces matches to land on
  // the project-specific name token instead.
  "bridge", "bridges",
  "staking", "stake", "stakes", "restaking", "lst", "lrt",
  "vesting", "vest",
  "lending", "lend", "borrow", "borrowing",
  "swap", "swaps", "exchange", "exchanges", "dex", "dexes", "amm",
  "perp", "perps", "perpetual", "perpetuals",
  "vault", "vaults",
  "yield", "yields", "farm", "farming",
  "liquidity", "lp", "pool", "pools",
  "derivatives", "options", "futures",
  "stable", "stables", "stablecoin", "stablecoins",
  "oracle", "oracles",
  "treasury", "governance",
  "token", "tokens", "erc20", "erc721", "erc1155",
  "nft", "nfts",
  "gaming", "gamefi", "game", "games",
  "wallet", "wallets",
  "router", "factory",
  "creator", "creators", "rewards", "reward",
  // Chain / L2 / network names.
  "ethereum", "eth",
  "arbitrum", "optimism", "polygon", "base", "solana", "sol",
  "bitcoin", "btc", "avalanche", "avax", "fantom", "ftm",
  "binance", "bsc", "bnb", "tron", "near", "celo", "gnosis",
  "starknet", "zksync", "scroll", "linea", "blast", "mantle",
  "sui", "aptos", "cosmos", "polkadot", "cardano",
  "chain", "chains", "mainnet", "testnet",
  "l1", "l2", "layer", "layer1", "layer2", "evm", "zk", "zkevm",
  "native", "cross",
  // Org/role words common in audit titles.
  "offchain", "onchain",
  // More noisy product-name words seen in false-positive clusters.
  "liquid", "money", "cash", "trade", "trades", "trading", "trader",
  "generic", "infrastructure", "mitigation", "update", "upgrade",
  "app", "apps", "platform", "system", "engine", "core",
  "global", "labs",
  "collective", "hub",
  "market", "markets", "marketplace",
  "capital", "credit", "loan", "loans",
  "depin", "rwa", "sonic", "looped", "wrapped",
  "fund", "funds", "prize", "prizes", "raffle",
  "review", "reviewed",
  "reserve", "reserves", "reserved",
  "treasury", "vault", "deposit", "deposits", "savings",
  "crypto", "cryptos", "cryptocurrency",
  "asset", "assets",
  "v6", "v7", "v8",
]);

const MIN_STRONG_TOKEN_LEN = 4;

const VERSION_RE = /\bv([1-9]|1[0-9])\b/gi;

/**
 * Pulls out explicit `vN` version markers from a string. Returns lowercase
 * versions like "v3", "v4". Used to gate fuzzy matches: if BOTH the protocol
 * and the audit name carry a version, they must agree.
 */
export function extractVersions(input: string): Set<string> {
  if (!input) return new Set();
  const out = new Set<string>();
  for (const m of input.toLowerCase().matchAll(VERSION_RE)) {
    out.add(`v${m[1]}`);
  }
  return out;
}

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
  /**
   * Optional raw audit name (filename / contest slug) used for version
   * detection. The auditor index stores this as `raw_name`; tests can pass
   * it directly. When omitted, version gating is skipped.
   */
  raw_name?: string;
}

/**
 * Returns true when the protocol and audit share at least one non-stop token
 * of length ≥ 4. Short tokens are required to match exactly via the same
 * tokenization but, on their own, are not sufficient to anchor a match.
 *
 * Version gate: if both the protocol (slug or name) and the audit raw_name
 * mention an explicit `vN` version, the version sets must intersect. This
 * prevents an `aave-v4` audit from matching `aave-v3`, while still letting
 * the Aave parent (no version) match either child.
 */
export function isMatch(protocol: MatchInput, audit: AuditTokens): boolean {
  const protoTokens = new Set([...tokenize(protocol.slug), ...tokenize(protocol.name)]);
  if (protoTokens.size === 0) return false;
  const auditSet = new Set(audit.tokens);
  let tokenHit = false;
  for (const t of protoTokens) {
    if (t.length >= MIN_STRONG_TOKEN_LEN && auditSet.has(t)) {
      tokenHit = true;
      break;
    }
  }
  if (!tokenHit) return false;
  // Version gate.
  const protoVersions = new Set([
    ...extractVersions(protocol.slug),
    ...extractVersions(protocol.name),
  ]);
  const auditVersions = audit.raw_name ? extractVersions(audit.raw_name) : new Set<string>();
  if (protoVersions.size > 0 && auditVersions.size > 0) {
    for (const v of protoVersions) {
      if (auditVersions.has(v)) return true;
    }
    return false;
  }
  return true;
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
