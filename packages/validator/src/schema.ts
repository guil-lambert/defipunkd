import { z } from "zod";

export const GRADES = ["green", "orange", "red", "unknown"] as const;
export const SLICES = [
  "control",
  "ability-to-exit",
  "dependencies",
  "access",
  "verifiability",
] as const;

const EvidenceSchema = z
  .object({
    url: z.string().url(),
    shows: z.string().min(1).max(240),
    chain: z.string().optional(),
    address: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
    commit: z.string().regex(/^[0-9a-f]{7,40}$/).optional(),
    fetched_at: z.string().datetime().optional(),
  })
  .strict();

const base = z
  .object({
    schema_version: z.literal(1),
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/),
    slice: z.enum(SLICES),
    snapshot_generated_at: z.string().datetime(),
    prompt_version: z.number().int().min(1),
    analysis_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    model: z.string().min(1).max(120),
    chat_url: z.string().url().nullable().optional(),
    grade: z.enum(GRADES),
    headline: z.string().min(1).max(80),
    rationale: z.string().min(1).max(600),
    evidence: z.array(EvidenceSchema),
    unknowns: z.array(z.string().max(240)),
  })
  .strict();

export const SubmissionSchema = base.superRefine((val, ctx) => {
  if (val.grade === "unknown") {
    if (val.unknowns.length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["unknowns"],
        message: 'grade="unknown" requires unknowns[] to have ≥1 entry',
      });
    }
  } else {
    if (val.evidence.length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["evidence"],
        message: 'grade!="unknown" requires evidence[] to have ≥1 entry',
      });
    }
  }
});

export type Submission = z.infer<typeof base>;
