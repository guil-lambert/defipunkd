import type { Submission } from "./schema";
import { isExplorerUrl, isPublicChatShareUrl } from "./cross-check";

export type ScoredSubmission = {
  submission: Submission;
  sourcePath: string;
  weight: number;
};

export type MergedProtocolMetadata = NonNullable<Submission["protocol_metadata"]>;

export type Assessment = {
  schema_version: 3;
  slug: string;
  slice: Submission["slice"];
  snapshot_generated_at: string;
  consensus_grade: Submission["grade"];
  consensus_strength: "strong" | "weak";
  short_headline?: string;
  merged_at: string;
  primary_submission_path: string;
  merged_from: Array<{
    path: string;
    model: string;
    grade: Submission["grade"];
    weight: number;
    chat_url: string | null;
  }>;
  protocol_metadata?: MergedProtocolMetadata;
};

export type Disagreement = {
  slug: string;
  slice: Submission["slice"];
  reason: string;
  submissions: Array<{
    path: string;
    model: string;
    grade: Submission["grade"];
    headline: string;
    weight: number;
    chat_url: string | null;
  }>;
};

export type QuorumResult = { kind: "assessment"; assessment: Assessment } | { kind: "disagreement"; disagreement: Disagreement } | { kind: "insufficient"; count: number };

export type QuorumContext = {
  currentPromptVersion: number;
  currentSnapshotGeneratedAt: string;
  now: string;
};


function isHallucinationProneModel(model: string): boolean {
  const m = model.toLowerCase();
  if (/claude-haiku-4-5/.test(m)) return true;
  if (/gemini-3-flash-preview/.test(m)) return true;
  const gpt = m.match(/gpt-(\d+(?:\.\d+)?)/);
  if (gpt && parseFloat(gpt[1]!) <= 5.3) return true;
  return false;
}

function scoreOne(s: Submission, sourcePath: string, ctx: QuorumContext): ScoredSubmission {
  let weight = 1.0;
  if (!isPublicChatShareUrl(s.chat_url ?? null)) weight *= 0.05;

  const explorerCount = s.evidence.filter((e) => isExplorerUrl(e.url)).length;
  weight += Math.min(explorerCount * 0.1, 0.3);

  const fetchedAtCount = s.evidence.filter((e) => typeof e.fetched_at === "string" && e.fetched_at.length > 0).length;
  weight += Math.min(fetchedAtCount * 0.05, 0.2);

  if (Array.isArray(s.unknowns) && s.unknowns.length > 0 && s.grade !== "unknown") {
    weight += 0.15;
  }

  const versionDelta = ctx.currentPromptVersion - s.prompt_version;
  if (versionDelta > 0) weight -= 0.2 * versionDelta;

  if (s.snapshot_generated_at !== ctx.currentSnapshotGeneratedAt) weight -= 0.1;

  if (/\(autorun\)/i.test(s.model)) weight += 0.2;

  if (isHallucinationProneModel(s.model)) weight *= 0.25;

  if (weight < 0.1) weight = 0.1;
  return { submission: s, sourcePath, weight };
}

export function computeQuorum(
  entries: Array<{ submission: Submission; sourcePath: string }>,
  ctx: QuorumContext,
): QuorumResult {
  if (entries.length === 0) {
    return { kind: "insufficient", count: 0 };
  }
  if (entries.length < 2) {
    return { kind: "insufficient", count: entries.length };
  }

  const scored = entries.map((e) => scoreOne(e.submission, e.sourcePath, ctx));
  const totalWeight = scored.reduce((acc, s) => acc + s.weight, 0);

  const byGrade = new Map<Submission["grade"], ScoredSubmission[]>();
  for (const s of scored) {
    const bucket = byGrade.get(s.submission.grade) ?? [];
    bucket.push(s);
    byGrade.set(s.submission.grade, bucket);
  }

  let topGrade: Submission["grade"] | null = null;
  let topWeight = 0;
  let topCount = 0;
  for (const [grade, group] of byGrade.entries()) {
    const w = group.reduce((acc, x) => acc + x.weight, 0);
    if (w > topWeight) {
      topGrade = grade;
      topWeight = w;
      topCount = group.length;
    }
  }

  const share = topWeight / totalWeight;

  const slug = entries[0]!.submission.slug;
  const slice = entries[0]!.submission.slice;

  const merged_from = scored
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .map((s) => ({
      path: s.sourcePath,
      model: s.submission.model,
      grade: s.submission.grade,
      weight: round(s.weight),
      chat_url: s.submission.chat_url ?? null,
    }));

  const strong = share >= 0.6 && topCount >= 3;
  const weak = !strong && share >= 0.5 && topCount >= 2;

  if (strong || weak) {
    const agreeing = scored
      .filter((s) => s.submission.grade === topGrade)
      .sort((a, b) => b.weight - a.weight);
    const primary = agreeing[0]!;
    const short_headline = agreeing
      .map((s) => s.submission.short_headline)
      .find((v): v is string => typeof v === "string" && v.trim().length > 0);
    const metadata = mergeProtocolMetadata(scored);
    const assessment: Assessment = {
      schema_version: 3,
      slug,
      slice,
      snapshot_generated_at: primary.submission.snapshot_generated_at,
      consensus_grade: topGrade!,
      consensus_strength: strong ? "strong" : "weak",
      ...(short_headline ? { short_headline } : {}),
      merged_at: ctx.now,
      primary_submission_path: primary.sourcePath,
      merged_from,
      ...(metadata ? { protocol_metadata: metadata } : {}),
    };
    return { kind: "assessment", assessment };
  }

  const disagreement: Disagreement = {
    slug,
    slice,
    reason: `top grade "${topGrade}" holds ${(share * 100).toFixed(0)}% of weight over ${topCount} submission(s); consensus requires ≥50% and ≥2 submissions (weak) or ≥60% and ≥3 submissions (strong)`,
    submissions: scored.map((s) => ({
      path: s.sourcePath,
      model: s.submission.model,
      grade: s.submission.grade,
      headline: s.submission.headline,
      weight: round(s.weight),
      chat_url: s.submission.chat_url ?? null,
    })),
  };
  return { kind: "disagreement", disagreement };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

type Meta = NonNullable<Submission["protocol_metadata"]>;

export function mergeProtocolMetadata(scored: ScoredSubmission[]): Meta | undefined {
  const withMeta = scored.filter((s) => s.submission.protocol_metadata);
  if (withMeta.length === 0) return undefined;

  const github = unionArray(
    withMeta,
    (m) => m.github ?? [],
    (url) => url.toLowerCase(),
  );
  const audits = unionArray(
    withMeta,
    (m) => m.audits ?? [],
    (a) => `${a.firm.toLowerCase()}|${a.url.toLowerCase()}`,
  );
  const admin_addresses = unionArray(
    withMeta,
    (m) => m.admin_addresses ?? [],
    (a) => `${a.chain.toLowerCase()}|${a.address.toLowerCase()}`,
  );

  const docs_url = pickScalar(withMeta, (m) => m.docs_url ?? null);
  const governance_forum = pickScalar(withMeta, (m) => m.governance_forum ?? null);
  const bug_bounty_url = pickScalar(withMeta, (m) => m.bug_bounty_url ?? null);
  const security_contact = pickScalar(withMeta, (m) => m.security_contact ?? null);
  const deployed_contracts_doc = pickScalar(withMeta, (m) => m.deployed_contracts_doc ?? null);
  const upgradeability = pickScalar(withMeta, (m) => m.upgradeability ?? null);
  const voting_token = pickScalarBy(
    withMeta,
    (m) => m.voting_token ?? null,
    (v) => `${v.chain.toLowerCase()}|${v.address.toLowerCase()}`,
  );

  const out: Meta = {};
  if (github.length > 0) out.github = github;
  if (audits.length > 0) out.audits = audits;
  if (admin_addresses.length > 0) out.admin_addresses = admin_addresses;
  if (docs_url !== null) out.docs_url = docs_url;
  if (governance_forum !== null) out.governance_forum = governance_forum;
  if (bug_bounty_url !== null) out.bug_bounty_url = bug_bounty_url;
  if (security_contact !== null) out.security_contact = security_contact;
  if (deployed_contracts_doc !== null) out.deployed_contracts_doc = deployed_contracts_doc;
  if (upgradeability !== null) out.upgradeability = upgradeability;
  if (voting_token !== null) out.voting_token = voting_token;

  return Object.keys(out).length > 0 ? out : undefined;
}

function unionArray<T>(
  scored: ScoredSubmission[],
  get: (m: Meta) => T[],
  keyOf: (x: T) => string,
): T[] {
  const seen = new Map<string, { value: T; weight: number }>();
  for (const s of scored) {
    const items = get(s.submission.protocol_metadata!);
    for (const item of items) {
      const k = keyOf(item);
      const prev = seen.get(k);
      if (!prev || prev.weight < s.weight) seen.set(k, { value: item, weight: s.weight });
    }
  }
  return Array.from(seen.values())
    .sort((a, b) => b.weight - a.weight)
    .map((e) => e.value);
}

function pickScalar<T>(
  scored: ScoredSubmission[],
  get: (m: Meta) => T | null,
): T | null {
  return pickScalarBy(scored, get, (v) => JSON.stringify(v));
}

function pickScalarBy<T>(
  scored: ScoredSubmission[],
  get: (m: Meta) => T | null,
  keyOf: (v: T) => string,
): T | null {
  const tally = new Map<string, { value: T; count: number; weight: number }>();
  for (const s of scored) {
    const v = get(s.submission.protocol_metadata!);
    if (v === null || v === undefined) continue;
    const k = keyOf(v);
    const prev = tally.get(k);
    if (prev) {
      prev.count += 1;
      prev.weight += s.weight;
    } else {
      tally.set(k, { value: v, count: 1, weight: s.weight });
    }
  }
  if (tally.size === 0) return null;
  const entries = Array.from(tally.values());
  entries.sort((a, b) => b.count - a.count || b.weight - a.weight);
  return entries[0]!.value;
}
