import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename, dirname, resolve } from "node:path";
import { OverlaySchema, type Overlay } from "./overlay-schema";
import { mergeProtocol, type MergeWarning } from "./merge";
import type { Protocol, Snapshot } from "./types";
import {
  loadAssessments,
  aggregateProtocolMetadata,
  type LoadedAssessment,
  type SliceId as AssessmentSliceId,
  type ProtocolMetadata,
} from "./assessments";
import { loadMasters, type Master, type MasterSliceConsensus } from "./master";
import { loadSubmissions, type LoadedSubmission } from "./submissions";

export type { Protocol, Snapshot, ProtocolSnapshot, ProvenanceTag, Slug } from "./types";
export { getEnrichment, listEnrichedSlugs } from "./enrichment";
export type {
  EnrichmentAdapter,
  EnrichmentAdapterAddress,
  EnrichmentControl,
  EnrichmentControlAddress,
  EnrichmentSourceCode,
  EnrichmentSourceCodeAddress,
  ProtocolEnrichment,
} from "./enrichment";
export { OverlaySchema, type Overlay } from "./overlay-schema";
export { loadMasters, type Master, type MasterSliceConsensus } from "./master";
export { loadSubmissions, type LoadedSubmission, type SubmissionGrade, type SubmissionEvidence } from "./submissions";
export {
  loadAssessments,
  aggregateProtocolMetadata,
  type LoadedAssessment,
  type AssessmentGrade,
  type AssessmentStrength,
  type SliceId as AssessmentSliceId,
  type Rationale,
  type Finding,
  type Steelman,
  type ProtocolMetadata,
  type AuditEntry,
  type HumanSignoff,
  type VotingToken,
  type AdminAddress,
  type Upgradeability,
} from "./assessments";

function resolveDataDir(): string {
  const env = process.env.DEFIPUNKD_DATA_DIR;
  if (env) return resolve(env);
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, "data", "defillama-snapshot.json");
    if (existsSync(candidate)) return join(dir, "data");
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return join(process.cwd(), "data");
}

const DATA_DIR = resolveDataDir();

let cached: { bySlug: Map<string, Protocol>; childrenByParent: Map<string, Protocol[]> } | null =
  null;

function loadSnapshot(dataDir: string): Snapshot {
  const raw = readFileSync(join(dataDir, "defillama-snapshot.json"), "utf8");
  return JSON.parse(raw) as Snapshot;
}

function loadOverlays(dataDir: string): Map<string, Overlay> {
  const dir = join(dataDir, "overlays");
  const overlays = new Map<string, Overlay>();
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return overlays;
  }
  for (const file of entries) {
    if (!file.endsWith(".json")) continue;
    const slug = basename(file, ".json");
    const raw = readFileSync(join(dir, file), "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(`Overlay ${file}: invalid JSON: ${(err as Error).message}`);
    }
    const result = OverlaySchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(`Overlay ${file}: ${result.error.message}`);
    }
    overlays.set(slug, result.data);
  }
  return overlays;
}

export function buildIndex(dataDir: string = DATA_DIR): {
  bySlug: Map<string, Protocol>;
  childrenByParent: Map<string, Protocol[]>;
  warnings: MergeWarning[];
} {
  const snapshot = loadSnapshot(dataDir);
  const overlays = loadOverlays(dataDir);
  const warnings: MergeWarning[] = [];

  for (const [slug] of overlays) {
    if (!(slug in snapshot.protocols)) {
      warnings.push({ kind: "orphan_overlay", slug });
      overlays.delete(slug);
    }
  }

  const bySlug = new Map<string, Protocol>();
  const childrenByParent = new Map<string, Protocol[]>();

  for (const [slug, snap] of Object.entries(snapshot.protocols)) {
    const merged = mergeProtocol(snap, overlays.get(slug), warnings);
    bySlug.set(slug, merged);
  }

  const INHERITABLE = ["github", "twitter", "website"] as const;
  for (const child of bySlug.values()) {
    if (child.is_parent) continue;
    if (!child.parent_slug) continue;
    const parent = bySlug.get(child.parent_slug);
    if (!parent) continue;
    for (const field of INHERITABLE) {
      if (child._provenance[field] !== "defillama") continue;
      if (child[field] !== null && !(Array.isArray(child[field]) && child[field].length === 0)) continue;
      const parentValue = parent[field];
      if (parentValue === null || (Array.isArray(parentValue) && parentValue.length === 0)) continue;
      (child as Record<string, unknown>)[field] = parentValue;
      child._provenance[field] = "defillama-parent";
    }
  }

  for (const child of bySlug.values()) {
    if (!child.parent_slug) continue;
    const bucket = childrenByParent.get(child.parent_slug) ?? [];
    bucket.push(child);
    childrenByParent.set(child.parent_slug, bucket);
  }

  for (const w of warnings) {
    if (w.kind === "orphan_overlay") {
      console.warn(`[registry] orphan overlay for slug "${w.slug}" — skipping`);
    } else if (w.kind === "identity_overlay") {
      console.warn(
        `[registry] overlay for "${w.slug}" field "${w.field}" is byte-equal to snapshot — consider removing`,
      );
    }
  }

  return { bySlug, childrenByParent, warnings };
}

function getCache() {
  if (cached) return cached;
  const { bySlug, childrenByParent } = buildIndex();
  cached = { bySlug, childrenByParent };
  return cached;
}

export function listProtocols(): Protocol[] {
  return Array.from(getCache().bySlug.values());
}

export function getProtocol(slug: string): Protocol | undefined {
  return getCache().bySlug.get(slug);
}

let cachedAssessments: Map<string, Map<AssessmentSliceId, LoadedAssessment>> | null = null;
export function getAssessments(): Map<string, Map<AssessmentSliceId, LoadedAssessment>> {
  if (cachedAssessments) return cachedAssessments;
  cachedAssessments = loadAssessments(DATA_DIR);
  return cachedAssessments;
}

let cachedSubmissions: Map<string, Map<AssessmentSliceId, LoadedSubmission[]>> | null = null;
export function getSubmissions(): Map<string, Map<AssessmentSliceId, LoadedSubmission[]>> {
  if (cachedSubmissions) return cachedSubmissions;
  cachedSubmissions = loadSubmissions(DATA_DIR);
  return cachedSubmissions;
}

export function listChildren(parentSlug: string): Protocol[] {
  return getCache().childrenByParent.get(parentSlug) ?? [];
}

let cachedMasters: Map<string, Master> | null = null;
export function getMasters(): Map<string, Master> {
  if (cachedMasters) return cachedMasters;
  cachedMasters = loadMasters(DATA_DIR);
  return cachedMasters;
}
export function getMaster(slug: string): Master | undefined {
  return getMasters().get(slug);
}

let cachedMetadata: Map<string, ProtocolMetadata> | null = null;
export function getProtocolMetadata(slug: string): ProtocolMetadata | undefined {
  if (!cachedMetadata) {
    cachedMetadata = new Map();
    // Master files take precedence: they carry the LLM-reconciled metadata.
    for (const [s, master] of getMasters()) {
      if (master.protocol_metadata && Object.keys(master.protocol_metadata).length > 0) {
        cachedMetadata.set(s, master.protocol_metadata);
      }
    }
    // Fallback: per-slice aggregation for slugs without a master file.
    for (const [s, bySlice] of getAssessments()) {
      if (cachedMetadata.has(s)) continue;
      const merged = aggregateProtocolMetadata(bySlice);
      if (merged) cachedMetadata.set(s, merged);
    }
  }
  return cachedMetadata.get(slug);
}
