import { z } from "zod";
import { SLICES, ProtocolMetadataSchema, type Submission } from "./schema";
import {
  mergeProtocolMetadata,
  type Assessment,
  type ScoredSubmission,
} from "./quorum";

const SliceConsensusSchema = z
  .object({
    grade: z.enum(["green", "orange", "red", "unknown"]),
    strength: z.enum(["strong", "weak"]).nullable(),
    headline: z.string().min(1),
    rationale: z
      .object({
        findings: z.array(z.object({ code: z.string(), text: z.string() }).strict()),
        steelman: z
          .object({ red: z.string(), orange: z.string(), green: z.string() })
          .strict()
          .nullable(),
        verdict: z.string().min(1),
      })
      .strict(),
    evidence: z.array(
      z
        .object({
          url: z.string().url(),
          shows: z.string(),
          chain: z.string().optional(),
          address: z.string().optional(),
          commit: z.string().optional(),
          fetched_at: z.string().optional(),
        })
        .strict(),
    ),
    dissent: z.array(
      z
        .object({
          path: z.string(),
          model: z.string(),
          grade: z.enum(["green", "orange", "red", "unknown"]),
          reason: z.string().optional(),
        })
        .strict(),
    ),
  })
  .strict();

const SourceSubmissionSchema = z
  .object({
    slice: z.enum(SLICES),
    path: z.string(),
    model: z.string(),
    grade: z.enum(["green", "orange", "red", "unknown"]),
  })
  .strict();

export const MasterSchema = z
  .object({
    schema_version: z.literal(1),
    slug: z.string(),
    generated_at: z.string().datetime(),
    reconciler_model: z.string().min(1),
    reconciler_kind: z.enum(["llm", "deterministic-fallback"]),
    slices: z.object({
      control: SliceConsensusSchema,
      "ability-to-exit": SliceConsensusSchema,
      autonomy: SliceConsensusSchema,
      "open-access": SliceConsensusSchema,
      verifiability: SliceConsensusSchema,
    }),
    protocol_metadata: ProtocolMetadataSchema,
    source_submissions: z.array(SourceSubmissionSchema),
    flags: z.array(z.string()),
  })
  .strict();

export type Master = z.infer<typeof MasterSchema>;
export type SliceConsensus = z.infer<typeof SliceConsensusSchema>;

export type SubmissionBySlice = Map<Submission["slice"], Array<{ submission: Submission; sourcePath: string }>>;

export type DraftInputs = {
  slug: string;
  now: string;
  submissionsBySlice: SubmissionBySlice;
  assessmentsBySlice: Map<Submission["slice"], Assessment>;
};

/**
 * Deterministic seed used BOTH as LLM prompt context and as the fallback
 * master file when the LLM call fails or is skipped.
 */
export function buildDraftMaster(inputs: DraftInputs): Master {
  const slices = {} as Master["slices"];
  const sourceSubmissions: Master["source_submissions"] = [];
  const flags: string[] = [];

  for (const sliceId of SLICES) {
    const entries = inputs.submissionsBySlice.get(sliceId) ?? [];
    const assessment = inputs.assessmentsBySlice.get(sliceId) ?? null;

    for (const e of entries) {
      sourceSubmissions.push({
        slice: sliceId,
        path: e.sourcePath,
        model: e.submission.model,
        grade: e.submission.grade,
      });
    }

    slices[sliceId] = buildSliceConsensus(sliceId, entries, assessment, flags);
  }

  const allScored: ScoredSubmission[] = [];
  for (const entries of inputs.submissionsBySlice.values()) {
    for (const e of entries) {
      allScored.push({ submission: e.submission, sourcePath: e.sourcePath, weight: 1 });
    }
  }
  const protocol_metadata = mergeProtocolMetadata(allScored) ?? {};

  return {
    schema_version: 1,
    slug: inputs.slug,
    generated_at: inputs.now,
    reconciler_model: "deterministic",
    reconciler_kind: "deterministic-fallback",
    slices,
    protocol_metadata,
    source_submissions: sourceSubmissions,
    flags,
  };
}

function buildSliceConsensus(
  sliceId: Submission["slice"],
  entries: Array<{ submission: Submission; sourcePath: string }>,
  assessment: Assessment | null,
  flags: string[],
): SliceConsensus {
  if (entries.length === 0) {
    flags.push(`${sliceId}: no submissions`);
    return emptyConsensus();
  }

  if (!assessment) {
    flags.push(`${sliceId}: no deterministic quorum (insufficient or disagreement)`);
    const primary = entries[0]!;
    return {
      grade: "unknown",
      strength: null,
      headline: primary.submission.headline,
      rationale: primary.submission.rationale,
      evidence: dedupeEvidence(entries.flatMap((e) => e.submission.evidence)),
      dissent: entries
        .filter((e) => e !== primary)
        .map((e) => ({
          path: e.sourcePath,
          model: e.submission.model,
          grade: e.submission.grade,
        })),
    };
  }

  const primary = entries.find((e) => e.sourcePath === assessment.primary_submission_path) ?? entries[0]!;
  const dissent = entries
    .filter((e) => e.submission.grade !== assessment.consensus_grade)
    .map((e) => ({
      path: e.sourcePath,
      model: e.submission.model,
      grade: e.submission.grade,
    }));

  return {
    grade: assessment.consensus_grade,
    strength: assessment.consensus_strength,
    headline: primary.submission.headline,
    rationale: primary.submission.rationale,
    evidence: dedupeEvidence(
      entries
        .filter((e) => e.submission.grade === assessment.consensus_grade)
        .flatMap((e) => e.submission.evidence),
    ),
    dissent,
  };
}

function emptyConsensus(): SliceConsensus {
  return {
    grade: "unknown",
    strength: null,
    headline: "no submissions yet",
    rationale: {
      findings: [],
      steelman: null,
      verdict: "no submissions available for this slice",
    },
    evidence: [],
    dissent: [],
  };
}

function dedupeEvidence(ev: Submission["evidence"]): SliceConsensus["evidence"] {
  const seen = new Map<string, SliceConsensus["evidence"][number]>();
  for (const e of ev) {
    const key = e.url.toLowerCase();
    if (!seen.has(key)) seen.set(key, { ...e });
  }
  return Array.from(seen.values());
}
