<script lang="ts">
  import TierMedal from "./TierMedal.svelte";
  import type { Tier } from "../lib/tier";

  type ToggleableTier = Exclude<Tier, "none">;

  type Props = {
    selected?: Set<ToggleableTier>;
    onToggle?: (tier: ToggleableTier) => void;
  };

  let { selected, onToggle }: Props = $props();

  const items: { tier: ToggleableTier; label: string }[] = [
    { tier: "wood", label: "At least one model submission, no quorum yet" },
    { tier: "bronze", label: "AI consensus on at least one dimension" },
    { tier: "silver", label: "AI consensus on all dimensions" },
    { tier: "gold", label: "Verified by human committee" },
  ];

  const interactive = $derived(typeof onToggle === "function");
</script>

<div class="tier-legend" aria-label="Tier legend">
  {#each items as item}
    {@const active = selected?.has(item.tier) ?? false}
    {#if interactive}
      <button
        type="button"
        class="item"
        class:active
        aria-pressed={active}
        onclick={() => onToggle?.(item.tier)}
      >
        <TierMedal tier={item.tier} size={16} />
        <span class="label">{item.label}</span>
      </button>
    {:else}
      <span class="item">
        <TierMedal tier={item.tier} size={16} />
        <span class="label">{item.label}</span>
      </span>
    {/if}
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
    color: inherit;
  }
  .label { line-height: 1; }
  button.item {
    background: transparent;
    border: 1px solid transparent;
    border-radius: 999px;
    padding: 0.25rem 0.6rem;
    min-height: 32px;
    cursor: pointer;
    font-size: inherit;
    transition: background-color 120ms ease-out, border-color 120ms ease-out, color 120ms ease-out;
  }
  button.item:hover { color: var(--text); border-color: var(--surface-raised); }
  button.item.active {
    color: var(--text);
    background: var(--surface-raised);
    border-color: var(--surface-raised);
  }
</style>
