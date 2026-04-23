import type { ProtocolSnapshot, Snapshot } from "@defipunkd/registry";

export type SyncSummary = {
  total: number;
  newSlugs: string[];
  newlyDelisted: string[];
  deadToggledOn: string[];
  deadToggledOff: string[];
  tvlMovers: Array<{ slug: string; from: number | null; to: number | null; pct: number }>;
};

const TVL_MOVE_THRESHOLD = 0.5;

export function buildSummary(
  next: Record<string, ProtocolSnapshot>,
  previous: Snapshot | null,
): SyncSummary {
  const prior = previous?.protocols ?? {};
  const newSlugs: string[] = [];
  const newlyDelisted: string[] = [];
  const deadToggledOn: string[] = [];
  const deadToggledOff: string[] = [];
  const tvlMovers: SyncSummary["tvlMovers"] = [];

  for (const [slug, p] of Object.entries(next)) {
    const before = prior[slug];
    if (!before) {
      newSlugs.push(slug);
      continue;
    }
    if (!before.delisted_at && p.delisted_at) newlyDelisted.push(slug);
    if (!before.is_dead && p.is_dead) deadToggledOn.push(slug);
    if (before.is_dead && !p.is_dead) deadToggledOff.push(slug);
    if (
      typeof before.tvl === "number" &&
      typeof p.tvl === "number" &&
      before.tvl > 0
    ) {
      const pct = (p.tvl - before.tvl) / before.tvl;
      if (Math.abs(pct) >= TVL_MOVE_THRESHOLD) {
        tvlMovers.push({ slug, from: before.tvl, to: p.tvl, pct });
      }
    }
  }

  tvlMovers.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));

  return {
    total: Object.keys(next).length,
    newSlugs,
    newlyDelisted,
    deadToggledOn,
    deadToggledOff,
    tvlMovers,
  };
}

export function formatSummary(s: SyncSummary): string {
  const lines: string[] = [];
  lines.push(`# defipunkd sync`);
  lines.push(``);
  lines.push(`- total protocols: **${s.total}**`);
  lines.push(`- new: **${s.newSlugs.length}**`);
  lines.push(`- newly delisted: **${s.newlyDelisted.length}**`);
  lines.push(`- dead toggled on: **${s.deadToggledOn.length}**`);
  lines.push(`- dead toggled off: **${s.deadToggledOff.length}**`);
  lines.push(`- TVL movers (±50% DoD): **${s.tvlMovers.length}**`);
  if (s.newSlugs.length) {
    lines.push(``, `## New`, ...s.newSlugs.slice(0, 100).map((x) => `- ${x}`));
    if (s.newSlugs.length > 100) lines.push(`- … (+${s.newSlugs.length - 100} more)`);
  }
  if (s.newlyDelisted.length) {
    lines.push(``, `## Newly delisted`, ...s.newlyDelisted.map((x) => `- ${x}`));
  }
  if (s.deadToggledOn.length) {
    lines.push(``, `## Dead toggled on`, ...s.deadToggledOn.map((x) => `- ${x}`));
  }
  if (s.deadToggledOff.length) {
    lines.push(``, `## Dead toggled off`, ...s.deadToggledOff.map((x) => `- ${x}`));
  }
  if (s.tvlMovers.length) {
    lines.push(``, `## TVL movers (±50% DoD)`);
    for (const m of s.tvlMovers) {
      const pct = (m.pct * 100).toFixed(0);
      lines.push(`- ${m.slug}: ${fmt(m.from)} → ${fmt(m.to)} (${pct}%)`);
    }
  }
  return lines.join("\n") + "\n";
}

function fmt(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
