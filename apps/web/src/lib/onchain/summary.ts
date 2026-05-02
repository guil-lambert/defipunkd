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
}): string {
  const v = args.version ? ` (Safe ${args.version})` : "";
  return (
    `Safe ${args.address} on ${args.chain}${v} at block ${args.blockNumber}: ` +
    `${args.threshold}-of-${args.owners.length} multisig. Owners: ${args.owners.join(", ")}.`
  );
}

export function summarizeContractRead(args: {
  address: string;
  chain: string;
  method: string;
  result: unknown;
  blockNumber: bigint;
}): string {
  return (
    `Method ${args.method} on ${args.address} (${args.chain}) at block ${args.blockNumber} ` +
    `returned ${formatResult(args.result)}.`
  );
}

export function summarizeContractAbi(args: {
  address: string;
  chain: string;
  source: string;
  contractName: string | null;
  fnCount: number;
  eventCount: number;
}): string {
  const name = args.contractName ? ` "${args.contractName}"` : "";
  return (
    `ABI for${name} ${args.address} (${args.chain}) sourced from ${args.source}: ` +
    `${args.fnCount} functions, ${args.eventCount} events.`
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
