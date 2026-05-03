/**
 * One-line plain-English summaries for the read API.
 *
 * Intentionally small and deterministic: an LLM can paste them straight into
 * context. No marketing copy, no commentary — just the facts.
 */

export function summarizeSafeOwners(args: {
  address: string;
  chain: string;
  threshold: bigint;
  owners: readonly string[];
  version: string | null;
  blockNumber: bigint;
  /** Optional crawl URLs to append in prose form — survives JSON-key-dropping content extractors. */
  surfacers?: readonly string[];
}): string {
  const v = args.version ? ` (Safe ${args.version})` : "";
  const crawlClause = args.surfacers && args.surfacers.length > 0
    ? ` Crawl each owner: ${args.surfacers.join(" ")}.`
    : "";
  return (
    `Safe ${args.address} on ${args.chain}${v} at block ${args.blockNumber}: ` +
    `${args.threshold}-of-${args.owners.length} multisig. Owners: ${args.owners.join(", ")}.${crawlClause}`
  );
}

export function summarizeContractRead(args: {
  address: string;
  chain: string;
  method: string;
  result: unknown;
  blockNumber: bigint;
  /** Optional crawl URLs to append in prose form — survives JSON-key-dropping content extractors. */
  surfacers?: readonly string[];
}): string {
  const crawlClause = args.surfacers && args.surfacers.length > 0
    ? ` Crawl: ${args.surfacers.join(" ")}.`
    : "";
  return (
    `Method ${args.method} on ${args.address} (${args.chain}) at block ${args.blockNumber} ` +
    `returned ${formatResult(args.result)}.${crawlClause}`
  );
}

export function summarizeContractAbi(args: {
  address: string;
  chain: string;
  source: string;
  contractName: string | null;
  fnCount: number;
  eventCount: number;
  proxy?: { implementation: string } | null;
}): string {
  const name = args.contractName ? ` "${args.contractName}"` : "";
  const proxyClause = args.proxy
    ? ` Proxy detected; merged with implementation at ${args.proxy.implementation}.`
    : "";
  return (
    `ABI for${name} ${args.address} (${args.chain}) sourced from ${args.source}: ` +
    `${args.fnCount} functions, ${args.eventCount} events.${proxyClause}`
  );
}

function formatResult(result: unknown): string {
  if (Array.isArray(result)) {
    if (result.length === 0) return "an empty array";
    if (result.length <= 4) return `[${result.map(formatScalar).join(", ")}]`;
    return `an array of ${result.length} values starting with ${formatScalar(result[0])}`;
  }
  return formatScalar(result);
}

function formatScalar(v: unknown): string {
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v === null || v === undefined) return String(v);
  return JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? val.toString() : val));
}
