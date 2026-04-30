<script lang="ts">
  import { GRADE_FILL, GRADE_TOOLTIP, PIZZA_SLICES, type PizzaGrades } from "../lib/pizza";

  let { grades, size = 18 }: { grades: PizzaGrades; size?: number } = $props();

  // Keep geometry in sync with LandingTable's "sm" pizza so the small chart
  // looks the same in the tab strip and on the landing page.
  const radius = $derived(size);
  const stroke = $derived(size <= 24 ? 2 : 3);
  const cr = $derived(size <= 24 ? 1.5 : 5);
  let paths = $derived.by(() => {
    const cx = radius;
    const cy = radius;
    const angle = (2 * Math.PI) / PIZZA_SLICES.length;
    const da = Math.min(cr / radius, angle / 2 - 0.01);
    return PIZZA_SLICES.map((slice, i) => {
      const a0 = -Math.PI / 2 + i * angle;
      const a1 = a0 + angle;
      const Ax = cx + (radius - cr) * Math.cos(a0);
      const Ay = cy + (radius - cr) * Math.sin(a0);
      const Bx = cx + radius * Math.cos(a0 + da);
      const By = cy + radius * Math.sin(a0 + da);
      const Cx = cx + radius * Math.cos(a1 - da);
      const Cy = cy + radius * Math.sin(a1 - da);
      const Dx = cx + (radius - cr) * Math.cos(a1);
      const Dy = cy + (radius - cr) * Math.sin(a1);
      const grade = grades[slice.id] ?? "gray";
      return {
        id: slice.id,
        label: slice.label,
        d: `M${cx},${cy} L${Ax.toFixed(2)},${Ay.toFixed(2)} A${cr},${cr} 0 0 1 ${Bx.toFixed(2)},${By.toFixed(2)} A${radius},${radius} 0 0 1 ${Cx.toFixed(2)},${Cy.toFixed(2)} A${cr},${cr} 0 0 1 ${Dx.toFixed(2)},${Dy.toFixed(2)} Z`,
        fill: GRADE_FILL[grade],
        tooltip: GRADE_TOOLTIP[grade],
      };
    });
  });
</script>

<svg width={radius * 2} height={radius * 2} viewBox={`0 0 ${radius * 2} ${radius * 2}`} role="img" aria-label="risk pizza">
  {#each paths as p}
    <path d={p.d} fill={p.fill} stroke="#08090c" stroke-width={stroke} stroke-linejoin="round">
      <title>{`${p.label} — ${p.tooltip}`}</title>
    </path>
  {/each}
</svg>
