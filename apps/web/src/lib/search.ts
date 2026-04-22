export type Searchable = {
  slug: string;
  name: string;
  category: string;
};

export function rankMatch<T extends Searchable>(items: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  type Scored = { item: T; score: number };
  const scored: Scored[] = [];
  for (const item of items) {
    const fields = [item.name, item.slug, item.category];
    let best = -1;
    for (let i = 0; i < fields.length; i++) {
      const f = (fields[i] ?? "").toLowerCase();
      const idx = f.indexOf(q);
      if (idx < 0) continue;
      const prefixBonus = idx === 0 ? 100 : 0;
      const fieldBonus = i === 0 ? 20 : i === 1 ? 10 : 0;
      const closeness = Math.max(0, 50 - idx);
      const score = prefixBonus + fieldBonus + closeness;
      if (score > best) best = score;
    }
    if (best >= 0) scored.push({ item, score: best });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}
