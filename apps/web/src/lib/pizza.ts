import type { GradeColor } from "./verifiability";
import type { PizzaGrades } from "../components/PizzaChart";

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
