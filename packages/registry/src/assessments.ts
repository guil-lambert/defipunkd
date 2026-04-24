import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

export type AssessmentGrade = "green" | "orange" | "red" | "unknown";
export type AssessmentStrength = "strong" | "weak";
export type SliceId = "control" | "ability-to-exit" | "autonomy" | "access" | "verifiability";

export type Finding = { code: string; text: string };
export type Steelman = { red: string; orange: string; green: string };
export type Rationale = {
  findings: Finding[];
  steelman: Steelman | null;
  verdict: string;
};

export type AuditEntry = { firm: string; url: string; date?: string };
export type VotingToken = { chain: string; address: string; symbol?: string };
export type AdminAddress = {
  chain: string;
  address: string;
  role: string;
  actor_class: "eoa" | "multisig" | "timelock" | "governance" | "unknown";
};
export type Upgradeability = "immutable" | "upgradeable" | "mixed" | "unknown";
export type ProtocolMetadata = {
  github?: string[];
  docs_url?: string | null;
  audits?: AuditEntry[];
  governance_forum?: string | null;
  voting_token?: VotingToken | null;
  bug_bounty_url?: string | null;
  security_contact?: string | null;
  deployed_contracts_doc?: string | null;
  admin_addresses?: AdminAddress[];
  upgradeability?: Upgradeability;
  about?: string | null;
};

export type LoadedAssessment = {
  slug: string;
  slice: SliceId;
  grade: AssessmentGrade;
  strength: AssessmentStrength;
  headline: string;
  rationale: Rationale;
  models: string[];
  merged_at?: string;
  protocol_metadata?: ProtocolMetadata;
};

type RawAssessment = {
  schema_version: number;
  slug: string;
  slice: SliceId;
  consensus_grade: AssessmentGrade;
  consensus_strength: AssessmentStrength;
  merged_at?: string;
  primary_submission_path: string;
  merged_from?: Array<{ model: string }>;
  protocol_metadata?: ProtocolMetadata;
};

type RawSubmission = {
  headline: string;
  rationale: Rationale;
};

export function loadAssessments(dataDir: string): Map<string, Map<SliceId, LoadedAssessment>> {
  const out = new Map<string, Map<SliceId, LoadedAssessment>>();
  const assessmentsDir = join(dataDir, "assessments");
  if (!existsSync(assessmentsDir)) return out;

  let slugDirs: string[];
  try {
    slugDirs = readdirSync(assessmentsDir);
  } catch {
    return out;
  }

  const repoRoot = dataDir.replace(/\/data\/?$/, "");

  for (const slug of slugDirs) {
    const slugPath = join(assessmentsDir, slug);
    let s;
    try {
      s = statSync(slugPath);
    } catch {
      continue;
    }
    if (!s.isDirectory()) continue;

    let sliceFiles: string[];
    try {
      sliceFiles = readdirSync(slugPath);
    } catch {
      continue;
    }

    const bySlice = new Map<SliceId, LoadedAssessment>();

    for (const file of sliceFiles) {
      if (!file.endsWith(".json")) continue;
      const sliceId = file.slice(0, -5) as SliceId;
      const path = join(slugPath, file);

      let raw: RawAssessment;
      try {
        raw = JSON.parse(readFileSync(path, "utf8")) as RawAssessment;
      } catch (err) {
        console.warn(`[registry] invalid assessment ${path}: ${(err as Error).message}`);
        continue;
      }

      const submissionPath = join(repoRoot, raw.primary_submission_path);
      let sub: RawSubmission;
      try {
        sub = JSON.parse(readFileSync(submissionPath, "utf8")) as RawSubmission;
      } catch (err) {
        console.warn(
          `[registry] assessment ${slug}/${sliceId} references missing submission ${raw.primary_submission_path}: ${(err as Error).message}`,
        );
        continue;
      }

      const models = Array.from(
        new Set((raw.merged_from ?? []).map((m) => m.model).filter((m) => typeof m === "string" && m.length > 0)),
      );

      bySlice.set(sliceId, {
        slug: raw.slug,
        slice: raw.slice,
        grade: raw.consensus_grade,
        strength: raw.consensus_strength,
        headline: sub.headline,
        rationale: sub.rationale,
        models,
        merged_at: raw.merged_at,
        protocol_metadata: raw.protocol_metadata,
      });
    }

    if (bySlice.size > 0) out.set(slug, bySlice);
  }

  return out;
}

/**
 * Aggregate per-slice protocol_metadata into one blob per slug.
 * Arrays are unioned; scalars pick the most-recent non-null value by merged_at.
 */
export function aggregateProtocolMetadata(
  bySlice: Map<SliceId, LoadedAssessment>,
): ProtocolMetadata | undefined {
  const entries = Array.from(bySlice.values())
    .filter((a) => a.protocol_metadata)
    .sort((a, b) => (b.merged_at ?? "").localeCompare(a.merged_at ?? ""));
  if (entries.length === 0) return undefined;

  const github = unionBy(entries, (m) => m.github ?? [], (s) => s.toLowerCase());
  const audits = unionBy(
    entries,
    (m) => m.audits ?? [],
    (a) => `${a.firm.toLowerCase()}|${a.url.toLowerCase()}`,
  );
  const admin_addresses = unionBy(
    entries,
    (m) => m.admin_addresses ?? [],
    (a) => `${a.chain.toLowerCase()}|${a.address.toLowerCase()}`,
  );

  const out: ProtocolMetadata = {};
  if (github.length > 0) out.github = github;
  if (audits.length > 0) out.audits = audits;
  if (admin_addresses.length > 0) out.admin_addresses = admin_addresses;

  const firstNonNull = <T,>(pick: (m: ProtocolMetadata) => T | null | undefined): T | null => {
    for (const e of entries) {
      const v = pick(e.protocol_metadata!);
      if (v !== null && v !== undefined) return v;
    }
    return null;
  };
  const docs_url = firstNonNull((m) => m.docs_url);
  if (docs_url !== null) out.docs_url = docs_url;
  const governance_forum = firstNonNull((m) => m.governance_forum);
  if (governance_forum !== null) out.governance_forum = governance_forum;
  const voting_token = firstNonNull((m) => m.voting_token);
  if (voting_token !== null) out.voting_token = voting_token;
  const bug_bounty_url = firstNonNull((m) => m.bug_bounty_url);
  if (bug_bounty_url !== null) out.bug_bounty_url = bug_bounty_url;
  const security_contact = firstNonNull((m) => m.security_contact);
  if (security_contact !== null) out.security_contact = security_contact;
  const deployed_contracts_doc = firstNonNull((m) => m.deployed_contracts_doc);
  if (deployed_contracts_doc !== null) out.deployed_contracts_doc = deployed_contracts_doc;
  const upgradeability = firstNonNull((m) => m.upgradeability);
  if (upgradeability !== null) out.upgradeability = upgradeability;
  const about = firstNonNull((m) => m.about);
  if (about !== null) out.about = about;

  return Object.keys(out).length > 0 ? out : undefined;
}

function unionBy<T>(
  entries: LoadedAssessment[],
  get: (m: ProtocolMetadata) => T[],
  keyOf: (x: T) => string,
): T[] {
  const seen = new Map<string, T>();
  for (const e of entries) {
    for (const item of get(e.protocol_metadata!)) {
      const k = keyOf(item);
      if (!seen.has(k)) seen.set(k, item);
    }
  }
  return Array.from(seen.values());
}
