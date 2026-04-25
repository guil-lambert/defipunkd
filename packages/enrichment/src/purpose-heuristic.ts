import type { PurposeHint } from "./types.js";

/**
 * Map a context identifier (variable name, property key) to a purpose hint.
 * Pure lexical heuristic — case-insensitive substring match against keywords.
 * Order matters: more specific keywords ("oracle") win over generic ("token").
 */
const KEYWORDS: Array<[RegExp, PurposeHint]> = [
  [/oracle|priceFeed|aggregator/i, "oracle"],
  [/admin|owner|governance|governor|timelock|multisig|treasury|safe/i, "admin"],
  [/factory/i, "factory"],
  [/router/i, "router"],
  [/vault/i, "vault"],
  [/staking|stake|gauge|lock/i, "staking"],
  [/pool|pair|amm|market/i, "pool"],
  [/token|coin|asset|reward/i, "token"],
];

export function inferPurpose(context: string | null): PurposeHint {
  if (!context) return "unknown";
  for (const [re, hint] of KEYWORDS) {
    if (re.test(context)) return hint;
  }
  return "unknown";
}
