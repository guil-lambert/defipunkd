import { PIZZA_SLICES, type PizzaSliceId } from "./pizza";

export type Tier = "none" | "wood" | "bronze" | "silver" | "gold";

export const QUORUM_MIN = 3;

export type TierSliceInput = {
  models?: string[];
  merged_at?: string;
  human_signoff?: { signed_at: string; signers?: string[] } | null;
  /** Number of raw submissions for this slice — used to derive the "wood" tier. */
  submissionCount?: number;
  /** True when the merged consensus is flagged as tentative (weak/low-confidence). */
  tentative?: boolean;
};

export type TierInput = Partial<Record<PizzaSliceId, TierSliceInput>>;

export function deriveTier(input: TierInput | undefined | null): Tier {
  if (!input) return "none";
  let quorumCount = 0;
  let tentativeQuorumCount = 0;
  let hasAnySubmission = false;
  for (const { id } of PIZZA_SLICES) {
    const slice = input[id];
    if (!slice) continue;
    const hasQuorum = (slice.models?.length ?? 0) >= QUORUM_MIN;
    if (hasQuorum) {
      quorumCount += 1;
      if (slice.tentative) tentativeQuorumCount += 1;
    }
    if ((slice.submissionCount ?? 0) >= 1 || (slice.models?.length ?? 0) >= 1) {
      hasAnySubmission = true;
    }
  }
  if (quorumCount >= PIZZA_SLICES.length) {
    return tentativeQuorumCount === 0 ? "gold" : "silver";
  }
  if (quorumCount >= 1) return "bronze";
  if (hasAnySubmission) return "wood";
  return "none";
}

export const TIER_RANK: Record<Tier, number> = {
  none: 0,
  wood: 1,
  bronze: 2,
  silver: 3,
  gold: 4,
};

export function maxTier(tiers: Tier[]): Tier {
  let best: Tier = "none";
  for (const t of tiers) {
    if (TIER_RANK[t] > TIER_RANK[best]) best = t;
  }
  return best;
}

export type GradientStop = { offset: string; color: string };

export const TIER_STOPS: Record<Exclude<Tier, "none">, GradientStop[]> = {
  wood: [
    { offset: "0%", color: "#A89684" },
    { offset: "50%", color: "#7C6B58" },
    { offset: "100%", color: "#4E4338" },
  ],
  bronze: [
    { offset: "0%", color: "#E8B896" },
    { offset: "50%", color: "#B8763E" },
    { offset: "100%", color: "#7A4A1E" },
  ],
  silver: [
    { offset: "0%", color: "#E8E8EC" },
    { offset: "50%", color: "#A8A8B0" },
    { offset: "100%", color: "#6C6C74" },
  ],
  gold: [
    { offset: "0%", color: "#FFE69A" },
    { offset: "50%", color: "#D4A84A" },
    { offset: "100%", color: "#8A6A1E" },
  ],
};

/** Rim stroke color = darkest (shadow) stop of the tier gradient. */
export const TIER_RIM_COLOR: Record<Exclude<Tier, "none">, string> = {
  wood: "#4E4338",
  bronze: "#7A4A1E",
  silver: "#6C6C74",
  gold: "#8A6A1E",
};

/** Check-glyph color = midtone stop of the tier gradient. */
export const TIER_CHECK_COLOR: Record<Exclude<Tier, "none">, string> = {
  wood: "#2C2620",
  bronze: "#5A3715",
  silver: "#4A4A52",
  gold: "#5A4410",
};

export const TIER_LABEL: Record<Exclude<Tier, "none">, string> = {
  wood: "Wood tier · At least one model submission, no quorum yet",
  bronze: "Bronze tier · AI consensus on at least one dimension",
  silver: "Silver tier · Weak AI consensus on all dimensions",
  gold: "Gold tier · Strong AI consensus on all dimensions",
};

/** Below this size the checkmark is dropped — disc/rim/gradient only. */
export const MEDAL_CHECK_MIN_SIZE = 12;
