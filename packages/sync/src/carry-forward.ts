import type { ProtocolSnapshot, Snapshot } from "@defipunkd/registry";

const DELIST_GRACE_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function daysBetween(laterIso: string, earlierIso: string): number {
  const later = Date.parse(laterIso);
  const earlier = Date.parse(earlierIso);
  return (later - earlier) / MS_PER_DAY;
}

export function carryForward(
  freshProtocols: Record<string, ProtocolSnapshot>,
  previous: Snapshot | null,
  generatedAt: string,
): Record<string, ProtocolSnapshot> {
  const out: Record<string, ProtocolSnapshot> = {};
  const prior = previous?.protocols ?? {};

  for (const [slug, fresh] of Object.entries(freshProtocols)) {
    const before = prior[slug];
    if (before) {
      out[slug] = {
        ...fresh,
        first_seen_at: before.first_seen_at,
        last_seen_at: generatedAt,
        delisted_at: null,
      };
    } else {
      out[slug] = fresh;
    }
  }

  for (const [slug, before] of Object.entries(prior)) {
    if (slug in freshProtocols) continue;
    const absentFor = daysBetween(generatedAt, before.last_seen_at);
    const newlyDelisted =
      before.delisted_at === null && absentFor >= DELIST_GRACE_DAYS ? generatedAt : before.delisted_at;
    out[slug] = {
      ...before,
      is_parent: before.is_parent ?? false,
      delisted_at: newlyDelisted,
      module: before.module ?? null,
    };
  }

  return out;
}
