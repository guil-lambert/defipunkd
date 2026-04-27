<script lang="ts">
  import {
    MEDAL_CHECK_MIN_SIZE,
    TIER_CHECK_COLOR,
    TIER_LABEL,
    TIER_RIM_COLOR,
    type Tier,
  } from "../lib/tier";

  type Props = { tier: Tier; size?: number };
  let { tier, size = 16 }: Props = $props();

  function starPath(cx: number, cy: number, outer: number, inner: number): string {
    const points: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
    }
    return `M${points.join(" L")} Z`;
  }
</script>

{#if tier === "none"}
  {@const s = size}
  {@const cx = s / 2}
  {@const r = s / 2 - 0.5}
  {@const showGlyph = s >= MEDAL_CHECK_MIN_SIZE}
  {@const armLen = s * 0.22}
  {@const armW = Math.max(1, s * 0.1)}
  <svg
    width={s}
    height={s}
    viewBox={`0 0 ${s} ${s}`}
    role="img"
    aria-label="No submissions yet"
    class="tier-medal tier-medal-empty"
  >
    <title>No submissions yet</title>
    <circle
      cx={cx}
      cy={cx}
      r={r}
      fill="none"
      stroke="var(--surface-raised)"
      stroke-width="1"
      stroke-dasharray="2 2"
    />
    {#if showGlyph}
      <line x1={cx - armLen} y1={cx} x2={cx + armLen} y2={cx} stroke="var(--text-muted)" stroke-width={armW} stroke-linecap="round" />
      <line x1={cx} y1={cx - armLen} x2={cx} y2={cx + armLen} stroke="var(--text-muted)" stroke-width={armW} stroke-linecap="round" />
    {/if}
  </svg>
{:else}
  {@const s = size}
  {@const cx = s / 2}
  {@const r = s / 2 - 0.5}
  {@const showGlyph = s >= MEDAL_CHECK_MIN_SIZE}
  {@const glyphColor = TIER_CHECK_COLOR[tier]}
  <svg
    width={s}
    height={s}
    viewBox={`0 0 ${s} ${s}`}
    role="img"
    aria-label={TIER_LABEL[tier]}
    class="tier-medal"
  >
    <title>{TIER_LABEL[tier]}</title>
    <circle
      cx={cx}
      cy={cx}
      r={r}
      fill={`url(#tier-${tier})`}
      stroke={TIER_RIM_COLOR[tier]}
      stroke-width="1"
    />
    {#if showGlyph}
      {#if tier === "wood"}
        {@const armLen = s * 0.26}
        {@const armW = Math.max(1.4, s * 0.13)}
        <line x1={cx - armLen} y1={cx} x2={cx + armLen} y2={cx} stroke={glyphColor} stroke-width={armW} stroke-linecap="round" />
        <line x1={cx} y1={cx - armLen} x2={cx} y2={cx + armLen} stroke={glyphColor} stroke-width={armW} stroke-linecap="round" />
      {:else if tier === "bronze"}
        {@const dotR = Math.max(0.9, s * 0.08)}
        {@const dotY = s / 2}
        {@const gap = s * 0.22}
        <circle cx={cx - gap} cy={dotY} r={dotR} fill={glyphColor} />
        <circle cx={cx} cy={dotY} r={dotR} fill={glyphColor} />
        <circle cx={cx + gap} cy={dotY} r={dotR} fill={glyphColor} />
      {:else if tier === "silver"}
        {@const strokeW = Math.max(1.5, s * 0.14)}
        {@const pad = s * 0.28}
        <path
          d={`M${pad} ${s * 0.52} L${s * 0.44} ${s - pad * 0.8} L${s - pad} ${s * 0.34}`}
          fill="none"
          stroke={glyphColor}
          stroke-width={strokeW}
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      {:else if tier === "gold"}
        {@const outer = s * 0.32}
        {@const inner = s * 0.14}
        <path d={starPath(cx, cx, outer, inner)} fill={glyphColor} />
      {/if}
    {/if}
  </svg>
{/if}

<style>
  .tier-medal {
    display: inline-block;
    vertical-align: middle;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4));
    overflow: visible;
  }
</style>
