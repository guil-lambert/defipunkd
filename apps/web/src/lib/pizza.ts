import type { GradeColor } from "./verifiability";

export const PIZZA_SLICES = [
  { id: "control", label: "Control" },
  { id: "ability-to-exit", label: "Ability to exit" },
  { id: "dependencies", label: "Dependencies" },
  { id: "access", label: "Access" },
  { id: "verifiability", label: "Verifiability" },
] as const;

export type PizzaSliceId = (typeof PIZZA_SLICES)[number]["id"];

export const GRADE_FILL: Record<GradeColor, string> = {
  gray: "#6b7785",
  green: "#34ad70",
  orange: "#e28e28",
  red: "#d13b3b",
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
  dependencies: GradeColor,
): PizzaGrades {
  if (category === "CEX") {
    return {
      control: "red",
      "ability-to-exit": "red",
      dependencies: "red",
      access: "red",
      verifiability: "red",
    };
  }
  return { verifiability, dependencies };
}
