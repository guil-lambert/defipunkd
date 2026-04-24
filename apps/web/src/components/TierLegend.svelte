<script lang="ts">
  import TierMedal from "./TierMedal.svelte";
  import type { Tier } from "../lib/tier";

  const items: { tier: Exclude<Tier, "none">; label: string }[] = [
    { tier: "bronze", label: "AI consensus on at least one dimension" },
    { tier: "silver", label: "AI consensus on all dimensions" },
    { tier: "gold", label: "Verified by human committee" },
  ];
</script>

<div class="tier-legend" aria-label="Tier legend">
  {#each items as item}
    <span class="item">
      <TierMedal tier={item.tier} size={16} />
      <span class="label">{item.label}</span>
    </span>
  {/each}
</div>

<style>
  .tier-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.25rem;
    align-items: center;
    color: var(--text-muted);
    font-size: 0.8rem;
    margin: 0.5rem 0 0.75rem;
  }
  .item {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .label { line-height: 1; }
</style>
