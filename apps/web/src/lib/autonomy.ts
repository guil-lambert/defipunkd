import type { GradeColor } from "./verifiability";

const LOW_AUTONOMY_CATEGORIES = new Set([
  "rwa lending",
  "liquid staking",
  "bridge",
  "canonical bridge",
  "cross chain bridge",
  "bridge aggregator",
  "bridge aggregators",
]);

export function categoryIsLowAutonomy(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return LOW_AUTONOMY_CATEGORIES.has(raw.trim().toLowerCase());
}

export function autonomyGrade(
  category: string | null | undefined,
  forkedFrom: number[] | null | undefined,
): GradeColor {
  if (categoryIsLowAutonomy(category)) return "red";
  if (forkedFrom && forkedFrom.length > 0) return "orange";
  return "gray";
}
