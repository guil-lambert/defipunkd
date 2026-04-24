import { z } from "zod";

export const GRADES = ["green", "orange", "red", "unknown"] as const;
export const SLICES = [
  "control",
  "ability-to-exit",
  "autonomy",
  "access",
  "verifiability",
] as const;

const EvidenceSchema = z
  .object({
    url: z.string().url(),
    shows: z.string().min(1),
    chain: z.string().optional(),
    address: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
    commit: z.string().regex(/^[0-9a-fA-F]{7,40}$/).optional(),
    fetched_at: z.string().datetime().optional(),
  })
  .passthrough();

const FindingSchema = z
  .object({
    code: z.string().regex(/^[A-Z][A-Za-z0-9-]{0,15}$/, { message: "finding code must look like E1, C2-emergency, V4a, etc." }),
    text: z.string().min(1),
  })
  .passthrough();

const SteelmanSchema = z
  .object({
    red: z.string().min(1),
    orange: z.string().min(1),
    green: z.string().min(1),
  })
  .passthrough();

const RationaleSchema = z
  .object({
    findings: z.array(FindingSchema),
    steelman: SteelmanSchema.nullable(),
    verdict: z.string().min(1),
  })
  .passthrough();

const AuditEntrySchema = z
  .object({
    firm: z.string().min(1),
    url: z.string().url(),
    date: z.string().regex(/^\d{4}(-\d{2}){0,2}$/).optional(),
  })
  .passthrough();

const VotingTokenSchema = z
  .object({
    chain: z.string().min(1),
    address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    symbol: z.string().min(1).max(32).optional(),
  })
  .passthrough();

const AdminAddressSchema = z
  .object({
    chain: z.string().min(1),
    address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    role: z.string().min(1),
    actor_class: z.enum(["eoa", "multisig", "timelock", "governance", "unknown"]),
  })
  .passthrough();

export const ProtocolMetadataSchema = z
  .object({
    github: z.array(z.string().url()).optional(),
    docs_url: z.string().url().nullable().optional(),
    audits: z.array(AuditEntrySchema).optional(),
    governance_forum: z.string().url().nullable().optional(),
    voting_token: VotingTokenSchema.nullable().optional(),
    bug_bounty_url: z.string().url().nullable().optional(),
    security_contact: z.string().min(1).nullable().optional(),
    deployed_contracts_doc: z.string().url().nullable().optional(),
    admin_addresses: z.array(AdminAddressSchema).optional(),
    upgradeability: z.enum(["immutable", "upgradeable", "mixed", "unknown"]).optional(),
  })
  .passthrough();

const base = z
  .object({
    schema_version: z.union([z.literal(2), z.literal(3)]),
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/),
    slice: z.enum(SLICES),
    snapshot_generated_at: z.string().datetime(),
    prompt_version: z.number().int().min(1),
    analysis_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    model: z.string().min(1).max(120),
    chat_url: z.string().url().nullable().optional(),
    grade: z.enum(GRADES),
    headline: z.string().min(1),
    short_headline: z.string().min(1).max(80).optional(),
    rationale: RationaleSchema,
    evidence: z.array(EvidenceSchema),
    unknowns: z.array(z.string().min(1)),
    protocol_metadata: ProtocolMetadataSchema.optional(),
  })
  .passthrough();

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
    if (val.rationale.steelman === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rationale", "steelman"],
        message: 'grade!="unknown" requires rationale.steelman to be present (red/orange/green)',
      });
    }
  }
});

export type Submission = z.infer<typeof base>;
