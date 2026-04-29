/**
 * Per-protocol TVL-surface metadata produced by @defipunkd/enrichment.
 *
 * IMPORTANT: this data describes the contract set DeFiLlama's TVL adapter
 * walks to compute TVL. That set is value-flow-driven, NOT a protocol's own
 * code surface. A lending protocol's adapter, for example, lists every
 * accepted collateral token — most of which are deployed and operated by
 * other protocols. Treat this as audit context for a reviewer, not a
 * derivable score for the verifiability or control slices.
 *
 * The registry exposes these files raw so the protocol detail page can
 * render them as a "Contracts walked for TVL" section. Slice grading still
 * runs through the DEFI@home pipeline, where an LLM is responsible for
 * distinguishing a protocol's own contracts from collateral.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

export interface EnrichmentAdapterAddress {
  chain: string | null;
  address: string;
  context: string | null;
  source_line?: number;
  purpose_hint?: string;
}

export interface EnrichmentAdapter {
  slug: string;
  adapter_commit: string | null;
  extracted_at: string;
  adapter_url: string;
  unresolved?: boolean;
  reason?: string;
  static_addresses: EnrichmentAdapterAddress[];
  dynamic_resolution: Array<{
    chain: string | null;
    factory: string | null;
    abi_call: string | null;
    source_line: number;
    note: string;
  }>;
  imports: string[];
  warnings: string[];
}

export interface EnrichmentSourceCodeAddress {
  chain: string;
  address: string;
  context: string | null;
  etherscan: {
    fetched: boolean;
    verified: boolean;
    contract_name: string | null;
    compiler: string | null;
    optimization: boolean;
    is_proxy: boolean;
    implementation: string | null;
  } | null;
  sourcify: {
    fetched: boolean;
    status: "perfect" | "partial" | "false" | null;
  } | null;
  warnings: string[];
}

export interface EnrichmentSourceCode {
  slug: string;
  adapter_commit: string | null;
  fetched_at: string;
  etherscan_v: "v2" | null;
  addresses: EnrichmentSourceCodeAddress[];
  summary: {
    total: number;
    verified_etherscan: number;
    verified_sourcify: number;
    proxies: number;
    skipped_unsupported_chain: number;
    skipped_etherscan: number;
  };
}

export interface EnrichmentControlAddress {
  chain: string;
  address: string;
  context: string | null;
  self_is_safe: boolean;
  self_safe: {
    threshold: number;
    owners_count: number;
    owners: string[];
    version: string | null;
    modules_count: number;
  } | null;
  self_not_safe_reason: string | null;
  owner: string | null;
  owner_is_safe: boolean;
  owner_safe: {
    threshold: number;
    owners_count: number;
    owners: string[];
    version: string | null;
    modules_count: number;
  } | null;
  owner_not_safe_reason: string | null;
  fetched: { owner: boolean; self: boolean; owner_safe: boolean };
  warnings: string[];
}

export interface EnrichmentControl {
  slug: string;
  adapter_commit: string | null;
  fetched_at: string;
  addresses: EnrichmentControlAddress[];
  summary: {
    total: number;
    owners_resolved: number;
    self_is_safe: number;
    owner_is_safe: number;
    owner_resolved_not_safe: number;
    unique_owner_safes: number;
    unique_owners: number;
  };
}

export interface EnrichmentAuditEntry {
  /** Auditor firm inferred from the URL host (e.g. "Trail of Bits"). May be null. */
  firm: string | null;
  /** Audit report URL — github blob, code4rena report, OZ blog post, etc. */
  url: string;
  /** YYYY-MM or YYYY-MM-DD when extractable from the auditor index, else null. */
  date: string | null;
  /** Where the entry came from: DefiLlama's audit_links or our auditor-side index. */
  source: "defillama" | "auditor-repo";
  raw_name?: string;
}

export interface EnrichmentAudits {
  slug: string;
  extracted_at: string;
  audits: EnrichmentAuditEntry[];
}

export interface ProtocolEnrichment {
  adapter: EnrichmentAdapter | null;
  sourcecode: EnrichmentSourceCode | null;
  control: EnrichmentControl | null;
  audits: EnrichmentAudits | null;
}

/**
 * Walk up from cwd looking for `data/enrichment/`. Mirrors the same root-
 * discovery the rest of the registry uses.
 */
function findEnrichmentRoot(): string | null {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, "data", "enrichment");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const ROOT = findEnrichmentRoot();

function readJsonIfExists<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

/**
 * Per-slug load. Files are read on demand (no eager scan of all 4000+
 * directories) to keep cold-start cheap. The serverless function caches
 * results across requests within a warm instance via a small map.
 */
const cache = new Map<string, ProtocolEnrichment>();

export function getEnrichment(slug: string): ProtocolEnrichment {
  if (!ROOT) return { adapter: null, sourcecode: null, control: null, audits: null };
  const cached = cache.get(slug);
  if (cached) return cached;
  const dir = join(ROOT, slug);
  const value: ProtocolEnrichment = {
    adapter: readJsonIfExists<EnrichmentAdapter>(join(dir, "adapter.json")),
    sourcecode: readJsonIfExists<EnrichmentSourceCode>(join(dir, "sourcecode.json")),
    control: readJsonIfExists<EnrichmentControl>(join(dir, "control.json")),
    audits: readJsonIfExists<EnrichmentAudits>(join(dir, "audits.json")),
  };
  cache.set(slug, value);
  return value;
}

export function listEnrichedSlugs(): string[] {
  if (!ROOT) return [];
  try {
    return readdirSync(ROOT, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}
