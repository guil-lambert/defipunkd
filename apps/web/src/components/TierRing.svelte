<script lang="ts">
  import { ringStroke, ringStrokeWidth, TIER_LABEL, type Tier } from "../lib/tier";

  type Props = {
    tier: Tier;
    /** Pie diameter in px (used to pick gradient vs fallback + stroke width). */
    diameter: number;
    /** If true, render as a standalone <svg> (for legend). Otherwise render only the <circle> (to nest in parent SVG). */
    standalone?: boolean;
    titleText?: string;
  };

  let { tier, diameter, standalone = false, titleText }: Props = $props();
</script>

{#if tier !== "none"}
  {@const sw = ringStrokeWidth(diameter)}
  {@const stroke = ringStroke(tier, diameter)}
  {@const r = diameter / 2 - sw / 2}
  {@const cx = diameter / 2}
  {@const label = titleText ?? TIER_LABEL[tier]}
  {#if standalone}
    <svg
      width={diameter}
      height={diameter}
      viewBox={`0 0 ${diameter} ${diameter}`}
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={stroke} stroke-width={sw} />
    </svg>
  {:else}
    <circle cx={cx} cy={cx} r={r} fill="none" stroke={stroke} stroke-width={sw} pointer-events="none">
      <title>{label}</title>
    </circle>
  {/if}
{/if}
