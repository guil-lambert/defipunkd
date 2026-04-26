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
  // Token symbols. Common patterns: STETH, WETH, USDC, USDT, WBTC, sUSDe,
  // weETH, cbETH, rETH, DAI, MATIC, LINK, etc. Liquid-staking/restaking
  // wrappers all carry an asset suffix.
  [/^([sw]?eth|w?steth|reth|cbeth|usd[a-z]*|w?btc|matic|dai|link|ldo|aave|crv|frax|mkr|sushi|uni|aevo|ena|usde|stmatic|stsol|wsol|sfrxeth|stbsc|stdot|stnear|frxeth|sweth|metis|fxs|cvx|cvxcrv|cvxfxs|wavax|gnosis|gno|tbtc|lbtc|cbbtc|btcn|wsts|s?dai|usds)$/i, "token"],
  [/token|coin|asset|reward/i, "token"],
];

export function inferPurpose(context: string | null): PurposeHint {
  if (!context) return "unknown";
  for (const [re, hint] of KEYWORDS) {
    if (re.test(context)) return hint;
  }
  return "unknown";
}
