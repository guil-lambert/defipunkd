import { PIZZA_SLICES, type PizzaSliceId } from "./pizza";

export type Tier = "none" | "bronze" | "silver" | "gold";

export const QUORUM_MIN = 3;

export type TierSliceInput = {
  models?: string[];
  merged_at?: string;
  human_signoff?: { signed_at: string; signers?: string[] } | null;
};

export type TierInput = Partial<Record<PizzaSliceId, TierSliceInput>>;

export function deriveTier(input: TierInput | undefined | null): Tier {
  if (!input) return "none";
  let quorumCount = 0;
  let hasSignoff = false;
  for (const { id } of PIZZA_SLICES) {
    const slice = input[id];
    if (!slice) continue;
    if (slice.human_signoff && slice.human_signoff.signed_at) hasSignoff = true;
    if ((slice.models?.length ?? 0) >= QUORUM_MIN) quorumCount += 1;
  }
  if (hasSignoff) return "gold";
  if (quorumCount >= PIZZA_SLICES.length) return "silver";
  if (quorumCount >= 1) return "bronze";
  return "none";
}

export const TIER_RANK: Record<Tier, number> = {
  none: 0,
  bronze: 1,
  silver: 2,
  gold: 3,
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

export const TIER_FALLBACK: Record<Exclude<Tier, "none">, string> = {
  bronze: "#B8763E",
  silver: "#A8A8B0",
  gold: "#D4A84A",
};

export const TIER_LABEL: Record<Exclude<Tier, "none">, string> = {
  bronze: "Bronze tier · AI consensus on at least one dimension",
  silver: "Silver tier · AI consensus on all dimensions",
  gold: "Gold tier · Verified by human committee",
};

export const TIER_SHORT_LABEL: Record<Exclude<Tier, "none">, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
};

export const SMALL_RING_THRESHOLD = 20;

export function ringStroke(tier: Exclude<Tier, "none">, diameter: number): string {
  return diameter < SMALL_RING_THRESHOLD ? TIER_FALLBACK[tier] : `url(#tier-${tier})`;
}

export function ringStrokeWidth(diameter: number): number {
  return diameter >= 32 ? 2.5 : 2;
}
