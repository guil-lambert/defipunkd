import type { AssessmentSliceId, LoadedAssessment, LoadedSubmission } from "@defipunkd/registry";
import { assessConfidence } from "./confidence";
export const ASSET_CRITERIA: { id: AssessmentSliceId; label: string }[] = [
  { id: "control", label: "Control" },
  { id: "ability-to-exit", label: "Ability to exit" },
  { id: "autonomy", label: "Autonomy" },
  { id: "open-access", label: "Open access" },
  { id: "verifiability", label: "Verifiability" },
];
// Deliberately bypass category heuristics: only actual review evidence belongs here.
export function assetCriterion(assessment?: LoadedAssessment, submissions: LoadedSubmission[] = []) {
  if (!assessment) return { status: submissions.length ? "Review pending" : "Not assessed", grade: "gray", assessment, tentative: false, reasons: [] as string[], submissions };
  const confidence = assessConfidence(assessment.consensus_sources, assessment.strength);
  return {
    status: assessment.grade === "unknown" ? "Unknown" : assessment.grade,
    grade: assessment.grade === "unknown" ? "gray" : assessment.grade,
    assessment, tentative: confidence.tentative, reasons: confidence.reasons, submissions,
  };
}
export function safeEvidenceUrl(value: string): string | undefined {
  try { const u = new URL(value); return u.protocol === "https:" || u.protocol === "http:" ? u.href : undefined; } catch { return undefined; }
}
