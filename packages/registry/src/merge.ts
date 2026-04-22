import type { Overlay } from "./overlay-schema";
import type { Protocol, ProtocolSnapshot, ProvenanceTag } from "./types";

const MERGEABLE_KEYS = [
  "name",
  "category",
  "chains",
  "tvl",
  "tvl_by_chain",
  "website",
  "twitter",
  "github",
  "audit_count",
  "audit_links",
  "hallmarks",
  "parent_slug",
  "forked_from",
  "is_dead",
] as const satisfies ReadonlyArray<keyof ProtocolSnapshot>;

export type MergeWarning =
  | { kind: "orphan_overlay"; slug: string }
  | { kind: "identity_overlay"; slug: string; field: keyof ProtocolSnapshot };

export function mergeProtocol(
  snapshot: ProtocolSnapshot,
  overlay: Overlay | undefined,
  warnings: MergeWarning[],
): Protocol {
  const provenance: Partial<Record<keyof ProtocolSnapshot, ProvenanceTag>> = {};
  const merged: ProtocolSnapshot = { ...snapshot };

  for (const key of MERGEABLE_KEYS) {
    if (overlay && key in overlay) {
      const overlayValue = overlay[key as keyof Overlay];
      const snapshotValue = snapshot[key];
      if (JSON.stringify(overlayValue) === JSON.stringify(snapshotValue)) {
        warnings.push({ kind: "identity_overlay", slug: snapshot.slug, field: key });
      }
      (merged as Record<string, unknown>)[key] = overlayValue as unknown;
      provenance[key] = "curated";
    } else {
      provenance[key] = "defillama";
    }
  }

  return { ...merged, _provenance: provenance };
}
