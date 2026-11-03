import { SLICE_IDS } from "@defipunkd/prompts";

export const DEFAULT_AUTORUN_MODEL = "claude-sonnet-5-5";

// Direct API USD / million tokens. Requests use one-hour prompt caching.
const PRICING: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheWrite: 4, cacheRead: 0.1 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheWrite: 6, cacheRead: 0.3 },
  "claude-opus-4-8": { input: 5, output: 25, cacheWrite: 10, cacheRead: 0.5 },
  "claude-opus-4-7": { input: 5, output: 25, cacheWrite: 10, cacheRead: 0.5 },
  "claude-opus-4-6": { input: 5, output: 25, cacheWrite: 10, cacheRead: 0.5 },
  "claude-opus-4-5": { input: 5, output: 25, cacheWrite: 10, cacheRead: 0.5 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheWrite: 2, cacheRead: 0.1 },
};

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  cacheCreateTokens: number;
  cacheReadTokens: number;
  webSearches: number;
};

export function estimateCost(model: string, u: Usage): number {
  const key = Object.keys(PRICING).find((k) => model === k || new RegExp(`^${k}-\\d{8}$`).test(model));
  if (!key) throw new Error(`No pricing configured for model ${model}; refusing unmetered autorun`);
  const p = PRICING[key]!;
  return (u.inputTokens * p.input + u.outputTokens * p.output +
    u.cacheCreateTokens * p.cacheWrite + u.cacheReadTokens * p.cacheRead) / 1_000_000 + u.webSearches * 0.01;
}

type Pull = { number: number; html_url: string; head: { ref: string; repo: { full_name: string } | null } };
type ChangedFile = { filename: string; status: string };

/** Pending work reserves a pair; it never becomes accepted evidence. */
export async function loadPendingAutorunPairs(
  repository: string,
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<Map<string, string[]>> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !token) {
    throw new Error("Open-PR exclusion requires GITHUB_REPOSITORY and GH_TOKEN");
  }
  async function pages<T>(path: string): Promise<T[]> {
    const all: T[] = [];
    for (let page = 1; ; page++) {
      const response = await fetcher(`https://api.github.com/repos/${repository}/${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`Open-PR lookup failed: GitHub HTTP ${response.status}`);
      const items: unknown = await response.json();
      if (!Array.isArray(items)) throw new Error("Invalid GitHub list response");
      all.push(...items as T[]);
      if (items.length < 100) return all;
      // GitHub exposes at most 3,000 files per PR. Never silently miss work.
      if (path.includes("/files") && all.length >= 3000) throw new Error("Autorun PR file list may be truncated; refusing incomplete lookup");
    }
  }
  const pending = new Map<string, string[]>();
  const pulls = await pages<Pull>("pulls?state=open");
  for (const pr of pulls) {
    if (!pr.head.ref.startsWith("autorun/") || pr.head.repo?.full_name !== repository) continue;
    for (const file of await pages<ChangedFile>(`pulls/${pr.number}/files`)) {
      if (file.status === "removed") continue;
      const match = /^data\/submissions\/([^/]+)\/([^/]+)\/[^/]+\.json$/.exec(file.filename);
      if (!match) continue;
      const [, slug, slice] = match;
      const slices = slice === "all" ? SLICE_IDS.filter((s) => s !== "discovery") : SLICE_IDS.filter((s) => s === slice);
      for (const s of slices) {
        const key = `${slug}/${s}`;
        pending.set(key, [...new Set([...(pending.get(key) ?? []), pr.html_url])]);
      }
    }
  }
  return pending;
}

export function excludePendingPairs<T extends { slug: string; slice: string }>(
  queue: T[], pending: Map<string, string[]>, log: (message: string) => void = console.log,
): T[] {
  return queue.filter(({ slug, slice }) => {
    const urls = pending.get(`${slug}/${slice}`);
    if (!urls) return true;
    log(`[${slug}/${slice}] pending in ${urls.join(", ")}; skipping`);
    return false;
  });
}
