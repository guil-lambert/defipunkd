import type { GradeColor } from "./verifiability";

export const PIZZA_SLICES = [
  { id: "control", label: "Control" },
  { id: "ability-to-exit", label: "Ability to exit" },
  { id: "autonomy", label: "Autonomy" },
  { id: "open-access", label: "Open Access" },
  { id: "verifiability", label: "Verifiability" },
] as const;

export type PizzaSliceId = (typeof PIZZA_SLICES)[number]["id"];

export const GRADE_FILL: Record<GradeColor, string> = {
  gray: "oklch(0.55 0.015 235)",
  green: "oklch(0.60 0.130 150)",
  orange: "oklch(0.65 0.120 75)",
  red: "oklch(0.52 0.170 22)",
};

export const GRADE_TOOLTIP: Record<GradeColor, string> = {
  gray: "unknown",
  green: "green",
  orange: "orange",
  red: "red",
};

export type PizzaSize = "sm" | "lg";
export type PizzaGrades = Partial<Record<PizzaSliceId, GradeColor>>;

export function pizzaGradesFor(
  category: string | null | undefined,
  verifiability: GradeColor,
  autonomy: GradeColor,
): PizzaGrades {
  if (category === "CEX") {
    return {
      control: "red",
      "ability-to-exit": "red",
      autonomy: "red",
      "open-access": "red",
      verifiability: "red",
    };
  }
  return { verifiability, autonomy };
}
