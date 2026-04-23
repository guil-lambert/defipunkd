import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

export type AssessmentGrade = "green" | "orange" | "red" | "unknown";
export type AssessmentStrength = "strong" | "weak";
export type SliceId = "control" | "ability-to-exit" | "dependencies" | "access" | "verifiability";

export type Finding = { code: string; text: string };
export type Steelman = { red: string; orange: string; green: string };
export type Rationale = {
  findings: Finding[];
  steelman: Steelman | null;
  verdict: string;
};

export type LoadedAssessment = {
  slug: string;
  slice: SliceId;
  grade: AssessmentGrade;
  strength: AssessmentStrength;
  headline: string;
  rationale: Rationale;
};

type RawAssessment = {
  schema_version: number;
  slug: string;
  slice: SliceId;
  consensus_grade: AssessmentGrade;
  consensus_strength: AssessmentStrength;
  primary_submission_path: string;
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

      bySlice.set(sliceId, {
        slug: raw.slug,
        slice: raw.slice,
        grade: raw.consensus_grade,
        strength: raw.consensus_strength,
        headline: sub.headline,
        rationale: sub.rationale,
      });
    }

    if (bySlice.size > 0) out.set(slug, bySlice);
  }

  return out;
}
