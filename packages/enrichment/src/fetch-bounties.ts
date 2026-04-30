/**
 * Bug-bounty platform crawlers.
 *
 * Both Immunefi and Cantina render their bounty listings as Next.js App
 * Router pages: the bounty array is embedded in the HTML as RSC stream
 * chunks (`self.__next_f.push([1, "..."])`). We concatenate those chunks,
 * unescape the string, and slice out the JSON array — no separate API
 * calls or auth needed.
 *
 * Each crawler returns normalized {platform, project, slug, url, tokens}
 * entries. Networking errors surface as warnings so the caller can keep
 * partial results.
 */

import { tokenize } from "./audit-match.js";

export type BountyPlatform = "Immunefi" | "Cantina";

export interface BountyEntry {
  platform: BountyPlatform;
  /** Display name from the platform (e.g. "LayerZero"). */
  project: string;
  /** Platform-side slug or identifier (e.g. "layerzero", or a Cantina UUID). */
  platform_slug: string;
  /** Public URL of the bounty page. */
  url: string;
  /** Tokenized form of project name for fuzzy matching. */
  tokens: string[];
  /** Max reward pool in USD when known. */
  max_reward_usd: number | null;
  /** Optional GitHub org/url declared by the project on the platform. */
  github: string | null;
  /** Optional project website declared on the platform. */
  website: string | null;
}

export interface CrawlBountyResult {
  entries: BountyEntry[];
  warnings: string[];
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,*/*" } });
  if (!res.ok) throw new Error(`http ${res.status} for ${url}`);
  return await res.text();
}

/**
 * Extracts the embedded RSC payload from a Next.js App Router page.
 * Concatenates all `self.__next_f.push([1, "..."])` chunks and decodes
 * their JS string-literal escapes.
 */
export function decodeRscStream(html: string): string {
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  let out = "";
  for (const m of html.matchAll(re)) {
    out += unescapeJsString(m[1]!);
  }
  return out;
}

function unescapeJsString(s: string): string {
  return s.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (_, esc) => {
    if (esc[0] === "u") return String.fromCharCode(parseInt(esc.slice(1), 16));
    if (esc[0] === "x") return String.fromCharCode(parseInt(esc.slice(1), 16));
    switch (esc) {
      case "n": return "\n";
      case "r": return "\r";
      case "t": return "\t";
      case "b": return "\b";
      case "f": return "\f";
      case "0": return "\0";
      case "\\": return "\\";
      case "\"": return "\"";
      case "'": return "'";
      case "/": return "/";
      default: return esc;
    }
  });
}

/**
 * Slices a balanced JSON array starting at the given `[` position.
 * Walks the string tracking string state and depth. Returns the array
 * substring or null if no balanced array can be parsed.
 */
export function sliceJsonArray(src: string, openBracket: number): string | null {
  if (src[openBracket] !== "[") return null;
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = openBracket; i < src.length; i++) {
    const c = src[i]!;
    if (inStr) {
      if (escape) { escape = false; continue; }
      if (c === "\\") { escape = true; continue; }
      if (c === "\"") inStr = false;
      continue;
    }
    if (c === "\"") { inStr = true; continue; }
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) return src.slice(openBracket, i + 1);
    }
  }
  return null;
}

// ---------- Immunefi ----------

interface ImmunefiBounty {
  slug: string;
  url: string;
  project: string;
  launchDate?: string;
  updatedDate?: string;
  maxBounty?: number;
  kyc?: boolean;
  contentfulId?: string;
}

export async function crawlImmunefi(): Promise<CrawlBountyResult> {
  const warnings: string[] = [];
  let html: string;
  try {
    html = await fetchHtml("https://immunefi.com/explore/");
  } catch (err) {
    return { entries: [], warnings: [`immunefi fetch failed: ${(err as Error).message}`] };
  }
  const decoded = decodeRscStream(html);
  const key = '"bounties":';
  const i = decoded.indexOf(key);
  if (i < 0) return { entries: [], warnings: ["immunefi: bounties array not found in RSC stream"] };
  const arr = sliceJsonArray(decoded, i + key.length);
  if (!arr) return { entries: [], warnings: ["immunefi: could not slice bounties array"] };
  let parsed: ImmunefiBounty[];
  try {
    parsed = JSON.parse(arr) as ImmunefiBounty[];
  } catch (err) {
    return { entries: [], warnings: [`immunefi: JSON.parse failed: ${(err as Error).message}`] };
  }
  const entries: BountyEntry[] = [];
  for (const b of parsed) {
    if (!b.slug || !b.project) continue;
    const url = b.url
      ? new URL(b.url, "https://immunefi.com").toString()
      : `https://immunefi.com/bug-bounty/${b.slug}/`;
    entries.push({
      platform: "Immunefi",
      project: b.project,
      platform_slug: b.slug,
      url,
      tokens: [...new Set([...tokenize(b.slug), ...tokenize(b.project)])],
      max_reward_usd: typeof b.maxBounty === "number" ? b.maxBounty : null,
      github: null,
      website: null,
    });
  }
  return { entries, warnings };
}

// ---------- Cantina ----------

interface CantinaCompany {
  id?: string;
  name?: string;
  handle?: string;
  website?: string | null;
  github?: string | null;
}

interface CantinaBounty {
  id: string;
  name: string;
  url: string;
  company?: CantinaCompany;
  status?: string;
  totalRewardPot?: string;
  currencyCode?: string;
  kind?: string;
  joined?: string;
}

export async function crawlCantina(): Promise<CrawlBountyResult> {
  const warnings: string[] = [];
  let html: string;
  try {
    html = await fetchHtml("https://cantina.xyz/bounties");
  } catch (err) {
    return { entries: [], warnings: [`cantina fetch failed: ${(err as Error).message}`] };
  }
  const decoded = decodeRscStream(html);
  // Find each bounty object by its UUID id pattern. Cantina embeds them
  // inline in a larger React tree, not in a single array we can slice
  // wholesale, so we scan for `{"id":"<uuid>",` openings and extract one
  // balanced object at a time.
  const idRe = /\{"id":"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}","name":/g;
  const seen = new Set<string>();
  const entries: BountyEntry[] = [];
  for (const m of decoded.matchAll(idRe)) {
    const start = m.index ?? -1;
    if (start < 0) continue;
    const obj = sliceJsonObject(decoded, start);
    if (!obj) continue;
    let parsed: CantinaBounty;
    try {
      parsed = JSON.parse(obj) as CantinaBounty;
    } catch {
      continue;
    }
    if (!parsed.id || !parsed.name || !parsed.url) continue;
    if (!parsed.url.includes("cantina.xyz/bounties/")) continue;
    if (seen.has(parsed.id)) continue;
    seen.add(parsed.id);
    if (parsed.status && parsed.status !== "live") continue;
    if (parsed.kind && parsed.kind !== "public_bounty") continue; // skip private/restricted
    const reward =
      typeof parsed.totalRewardPot === "string" && /^\d+(\.\d+)?$/.test(parsed.totalRewardPot)
        ? Number(parsed.totalRewardPot)
        : null;
    entries.push({
      platform: "Cantina",
      project: parsed.name,
      platform_slug: parsed.id,
      url: parsed.url,
      tokens: [...new Set([
        ...tokenize(parsed.name),
        ...(parsed.company?.handle ? tokenize(parsed.company.handle) : []),
        ...(parsed.company?.name ? tokenize(parsed.company.name) : []),
      ])],
      max_reward_usd: reward,
      github: parsed.company?.github ?? null,
      website: parsed.company?.website ?? null,
    });
  }
  if (entries.length === 0) {
    warnings.push("cantina: no bounties extracted from RSC stream");
  }
  return { entries, warnings };
}

function sliceJsonObject(src: string, openBrace: number): string | null {
  if (src[openBrace] !== "{") return null;
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = openBrace; i < src.length; i++) {
    const c = src[i]!;
    if (inStr) {
      if (escape) { escape = false; continue; }
      if (c === "\\") { escape = true; continue; }
      if (c === "\"") inStr = false;
      continue;
    }
    if (c === "\"") { inStr = true; continue; }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return src.slice(openBrace, i + 1);
    }
  }
  return null;
}
