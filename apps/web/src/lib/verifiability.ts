export type GradeColor = "green" | "orange" | "red" | "gray";

const SEVERITY: Record<GradeColor, number> = {
  gray: 0,
  green: 1,
  orange: 2,
  red: 3,
};

export function verifiabilityGrade(hasGithub: boolean, auditCount: number): GradeColor {
  const hasAudit = auditCount >= 1;
  if (hasGithub && hasAudit) return "green";
  if (hasGithub || hasAudit) return "orange";
  return "red";
}

export function worstGrade(grades: GradeColor[]): GradeColor {
  let worst: GradeColor = "gray";
  for (const g of grades) {
    if (SEVERITY[g] > SEVERITY[worst]) worst = g;
  }
  return worst;
}

export function dominantChildGrade<T extends { tvl: number | null; slug: string }>(
  children: T[],
  getGrade: (c: T) => GradeColor = (c) =>
    (c as unknown as { verifiability_grade: GradeColor }).verifiability_grade,
): GradeColor {
  let bestGrade: GradeColor = "gray";
  let bestTvl = -Infinity;
  let bestSlug = "";
  for (const c of children) {
    const tvl = typeof c.tvl === "number" ? c.tvl : -1;
    if (tvl > bestTvl || (tvl === bestTvl && c.slug < bestSlug)) {
      bestTvl = tvl;
      bestSlug = c.slug;
      bestGrade = getGrade(c);
    }
  }
  return bestGrade;
}
