import type { Submission } from "./schema";
import { isExplorerUrl } from "./cross-check";

export type ScoredSubmission = {
  submission: Submission;
  sourcePath: string;
  weight: number;
};

export type Assessment = {
  schema_version: 2;
  slug: string;
  slice: Submission["slice"];
  snapshot_generated_at: string;
  consensus_grade: Submission["grade"];
  consensus_strength: "strong" | "weak";
  merged_at: string;
  primary_submission_path: string;
  merged_from: Array<{
    path: string;
    model: string;
    grade: Submission["grade"];
    weight: number;
    chat_url: string | null;
  }>;
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

const PUBLIC_SHARE_HOSTS = [
  "claude.ai",
  "chatgpt.com",
  "chat.openai.com",
  "g.co",
  "gemini.google.com",
];

function isPublicShareUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (!PUBLIC_SHARE_HOSTS.some((h) => host === h || host.endsWith("." + h))) return false;
    return /\/share\//.test(new URL(url).pathname) || host === "g.co";
  } catch {
    return false;
  }
}

function scoreOne(s: Submission, sourcePath: string, ctx: QuorumContext): ScoredSubmission {
  let weight = 1.0;
  if (isPublicShareUrl(s.chat_url ?? null)) weight += 0.3;

  const explorerCount = s.evidence.filter((e) => isExplorerUrl(e.url)).length;
  weight += Math.min(explorerCount * 0.1, 0.3);

  const versionDelta = ctx.currentPromptVersion - s.prompt_version;
  if (versionDelta > 0) weight -= 0.2 * versionDelta;

  if (s.snapshot_generated_at !== ctx.currentSnapshotGeneratedAt) weight -= 0.1;

  if (/\(autorun\)/i.test(s.model)) weight += 0.2;

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
    const primary = scored
      .filter((s) => s.submission.grade === topGrade)
      .sort((a, b) => b.weight - a.weight)[0]!;
    const assessment: Assessment = {
      schema_version: 2,
      slug,
      slice,
      snapshot_generated_at: primary.submission.snapshot_generated_at,
      consensus_grade: topGrade!,
      consensus_strength: strong ? "strong" : "weak",
      merged_at: ctx.now,
      primary_submission_path: primary.sourcePath,
      merged_from,
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
