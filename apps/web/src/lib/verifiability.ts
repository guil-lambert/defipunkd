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
