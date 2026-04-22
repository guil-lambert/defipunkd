import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename, dirname, resolve } from "node:path";
import { OverlaySchema, type Overlay } from "./overlay-schema";
import { mergeProtocol, type MergeWarning } from "./merge";
import type { Protocol, Snapshot } from "./types";

export type { Protocol, Snapshot, ProtocolSnapshot, ProvenanceTag, Slug } from "./types";
export { OverlaySchema, type Overlay } from "./overlay-schema";

function resolveDataDir(): string {
  const env = process.env.DEFIBEAT_DATA_DIR;
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
    if (merged.parent_slug) {
      const bucket = childrenByParent.get(merged.parent_slug) ?? [];
      bucket.push(merged);
      childrenByParent.set(merged.parent_slug, bucket);
    }
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

export function listChildren(parentSlug: string): Protocol[] {
  return getCache().childrenByParent.get(parentSlug) ?? [];
}
