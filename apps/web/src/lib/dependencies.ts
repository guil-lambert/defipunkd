import type { GradeColor } from "./verifiability";

const HIGH_DEPENDENCY_CATEGORIES = new Set([
  "rwa lending",
  "liquid staking",
  "bridge",
  "canonical bridge",
  "cross chain bridge",
  "bridge aggregator",
  "bridge aggregators",
]);

export function categoryIsHighDependency(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return HIGH_DEPENDENCY_CATEGORIES.has(raw.trim().toLowerCase());
}

export function dependenciesGrade(
  category: string | null | undefined,
  forkedFrom: number[] | null | undefined,
): GradeColor {
  if (categoryIsHighDependency(category)) return "red";
  if (forkedFrom && forkedFrom.length > 0) return "orange";
  return "gray";
}
