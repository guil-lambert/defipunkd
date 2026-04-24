<script lang="ts">
  import { TIER_STOPS } from "../lib/tier";
  const tiers = ["bronze", "silver", "gold"] as const;
</script>

<svg aria-hidden="true" class="tier-gradients" focusable="false">
  <defs>
    {#each tiers as t}
      <linearGradient id={`tier-${t}`} x1="0" y1="0" x2="1" y2="1">
        {#each TIER_STOPS[t] as stop}
          <stop offset={stop.offset} stop-color={stop.color} />
        {/each}
      </linearGradient>
    {/each}
  </defs>
</svg>

<style>
  .tier-gradients {
    position: absolute;
    width: 0;
    height: 0;
    overflow: hidden;
    pointer-events: none;
  }
</style>
