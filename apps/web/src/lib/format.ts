export const EM_DASH = "\u2014";

export function formatProvTag(tag: string): string {
  return tag === "defi@home" ? "[:]" : `[${tag}]`;
}

export function formatTvl(n: number | null | undefined): string {
  if (n === null || n === undefined) return EM_DASH;
  if (n === 0) return "$0";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function formatUtc(iso: string | null | undefined): string {
  if (!iso) return EM_DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return EM_DASH;
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  const mm = pad(d.getUTCMonth() + 1);
  const dd = pad(d.getUTCDate());
  const hh = pad(d.getUTCHours());
  const mi = pad(d.getUTCMinutes());
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} UTC`;
}

export function auditorDomain(url: string): string | null {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export type Hallmark = { unixTs: number; description: string };

export function parseHallmarks(raw: unknown): Hallmark[] {
  if (!Array.isArray(raw)) return [];
  const out: Hallmark[] = [];
  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length !== 2) continue;
    const [ts, desc] = entry;
    if (typeof ts !== "number" || !Number.isFinite(ts)) continue;
    if (typeof desc !== "string") continue;
    out.push({ unixTs: ts, description: desc });
  }
  return out.sort((a, b) => a.unixTs - b.unixTs);
}

export function primaryChain(tvlByChain: Record<string, number>): string | null {
  const entries = Object.entries(tvlByChain);
  if (entries.length === 0) return null;
  entries.sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });
  return entries[0]![0];
}
