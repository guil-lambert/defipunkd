import type { Protocol } from "@defibeat/registry";
import type { GradeColor } from "./verifiability";
import { verifiabilityGrade } from "./verifiability";
import { dependenciesGrade } from "./dependencies";

export type SliceAssessment = {
  id: "control" | "ability-to-exit" | "dependencies" | "access" | "verifiability";
  label: string;
  grade: GradeColor;
  headline: string;
  rationale: string;
};

const BRIDGE_CATS = new Set([
  "Bridge",
  "Canonical Bridge",
  "Cross Chain Bridge",
  "Bridge Aggregator",
]);

function verifiabilityRationale(p: Protocol): { grade: GradeColor; headline: string; rationale: string } {
  const hasGithub = !!(p.github && p.github.length > 0);
  const hasAudit = (p.audit_count ?? 0) >= 1;
  const grade = verifiabilityGrade(hasGithub, p.audit_count ?? 0);
  if (grade === "green") {
    return {
      grade,
      headline: `Open source + ${p.audit_count} audit${p.audit_count === 1 ? "" : "s"}`,
      rationale:
        "Protocol publishes a GitHub repository and has at least one audit on record. This is a coarse Phase-0 signal only: auditor reputation, scope, and post-audit review coverage are not yet weighted.",
    };
  }
  if (grade === "orange" && hasGithub) {
    return {
      grade,
      headline: "Open source, no audits",
      rationale:
        "A GitHub repository is published but no audit is recorded in DeFiLlama's dataset. Audits may exist upstream without being indexed here; open a PR with an overlay if so.",
    };
  }
  if (grade === "orange" && hasAudit) {
    return {
      grade,
      headline: `${p.audit_count} audit${p.audit_count === 1 ? "" : "s"}, no public repo`,
      rationale:
        "At least one audit is recorded but no GitHub repository is published. Audits of closed-source code are weaker signal since readers cannot independently verify the deployed bytecode.",
    };
  }
  return {
    grade: "red",
    headline: "No public repo or audits",
    rationale:
      "Neither a GitHub repository nor any audit is recorded. At Phase 0 this is the most conservative verifiability signal DefiBeat can assign.",
  };
}

function dependenciesRationale(p: Protocol): { grade: GradeColor; headline: string; rationale: string } {
  const grade = dependenciesGrade(p.category, p.forked_from);
  const cat = p.category ?? "";
  if (grade === "red") {
    if (cat === "Liquid Staking" || cat === "Liquid Restaking") {
      return {
        grade,
        headline: "Liquid staking depends on validators",
        rationale:
          "Liquid staking and restaking protocols rely on an external validator set and slashing dynamics they do not control. This is a category-level structural dependency, not a per-protocol finding.",
      };
    }
    if (cat === "RWA Lending" || cat === "RWA") {
      return {
        grade,
        headline: "RWA lending depends on legal counterparties",
        rationale:
          "Real-world-asset lending introduces off-chain legal counterparties, custodians, and enforcement regimes as dependencies. These cannot be verified onchain.",
      };
    }
    if (BRIDGE_CATS.has(cat)) {
      return {
        grade,
        headline: "Bridge depends on external message validators",
        rationale:
          "Bridges rely on an external validator set, guardian signatures, or light-client proofs. This is a category-level structural dependency independent of any specific implementation.",
      };
    }
    return {
      grade,
      headline: `${cat || "Category"} carries category-level dependency risk`,
      rationale: "Protocol belongs to a category flagged red by the Phase-0 dependency heuristic.",
    };
  }
  if (grade === "orange") {
    return {
      grade,
      headline: "Forked from another protocol",
      rationale:
        "DeFiLlama records a non-empty forkedFrom lineage — the contracts inherit base logic from another codebase. Real fork detection is Phase-2 work; this is only an opportunistic first-pass signal.",
    };
  }
  return {
    grade: "gray",
    headline: "No Phase-0 dependency signal",
    rationale:
      "Neither the category heuristic nor the forkedFrom signal fires for this protocol. A real dependency graph (oracles, bridges, yield wrappers, collateral) arrives with Phase-2 onchain discovery.",
  };
}

export function assessProtocol(p: Protocol): SliceAssessment[] {
  const v = verifiabilityRationale(p);
  const d = dependenciesRationale(p);
  return [
    {
      id: "control",
      label: "Control",
      grade: "gray",
      headline: "Not yet assessed",
      rationale:
        "Who holds admin privileges, how contracts can be upgraded, and how quickly. No automated heuristic grades this at Phase 0; a real assessment arrives when onchain discovery reads roles, owners, and timelocks.",
    },
    {
      id: "ability-to-exit",
      label: "Ability to exit",
      grade: "gray",
      headline: "Not yet assessed",
      rationale:
        "Whether users can exit on their own terms if the team disappears or acts adversarially. Requires per-protocol review; not available at Phase 0.",
    },
    {
      id: "dependencies",
      label: "Dependencies",
      grade: d.grade,
      headline: d.headline,
      rationale: d.rationale,
    },
    {
      id: "access",
      label: "Access",
      grade: "gray",
      headline: "Not yet assessed",
      rationale:
        "Whether the protocol depends on privileged operators, whitelists, geo-restrictions, or off-chain infrastructure. This is not a signal DeFiLlama carries in a usable form; crawler-based detection lands in a later phase.",
    },
    {
      id: "verifiability",
      label: "Verifiability",
      grade: v.grade,
      headline: v.headline,
      rationale: v.rationale,
    },
  ];
}

export function cexAssessment(): SliceAssessment[] {
  const r =
    "Centralized exchanges are not onchain protocols. They are operated by a single legal entity that custodies user funds, can freeze withdrawals, and has full discretion over the codebase.";
  return [
    { id: "control", label: "Control", grade: "red", headline: "Operator-controlled", rationale: r },
    { id: "ability-to-exit", label: "Ability to exit", grade: "red", headline: "Withdrawals can be halted", rationale: r },
    { id: "dependencies", label: "Dependencies", grade: "red", headline: "Off-chain counterparty", rationale: r },
    { id: "access", label: "Access", grade: "red", headline: "Permissioned by design", rationale: r },
    { id: "verifiability", label: "Verifiability", grade: "red", headline: "Closed codebase", rationale: r },
  ];
}
