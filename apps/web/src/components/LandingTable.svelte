<script lang="ts">
  import {
    filterAndSortNodes,
    type ChainTabKey,
    type LandingNode,
    type SortDir,
    type SortField,
  } from "../lib/landing";
  import { CHAIN_TABS, DEFAULT_TAB, TABS, type CategoryTab, type Tab } from "../lib/category-map";
  import { PIZZA_SLICES, GRADE_FILL, GRADE_TOOLTIP, pizzaGradesFor, type PizzaGrades, type PizzaSize } from "../lib/pizza";
  import { EM_DASH, formatTvl } from "../lib/format";
  import TierGradients from "./TierGradients.svelte";
  import TierMedal from "./TierMedal.svelte";
  import TierLegend from "./TierLegend.svelte";
  import { TIER_LABEL, type Tier } from "../lib/tier";

  type ToggleableTier = Exclude<Tier, "none">;

  const DEFAULT_PAGE = 200;

  type Props = {
    nodes: LandingNode[];
    tabCounts: Record<Tab, number>;
    chainTvl: Record<ChainTabKey, number>;
  };

  let { nodes, tabCounts, chainTvl }: Props = $props();

  const FIXED_CATS = ["All", "DeFi"] as const;
  const sortedCategoryTabs: CategoryTab[] = [
    ...FIXED_CATS,
    ...(TABS.filter((t) => !FIXED_CATS.includes(t as typeof FIXED_CATS[number])) as CategoryTab[])
      .sort((a, b) => (tabCounts[b] ?? 0) - (tabCounts[a] ?? 0)),
  ];
  const sortedChainRow: ChainTabKey[] = [
    "All",
    ...[...CHAIN_TABS].sort((a, b) => (chainTvl[b] ?? 0) - (chainTvl[a] ?? 0)),
  ];

  let tab = $state<CategoryTab>(DEFAULT_TAB);
  let chainTab = $state<ChainTabKey>("All");
  let query = $state("");
  let showInactive = $state(false);
  let showAll = $state(false);
  let expanded = $state<Record<string, boolean>>({});
  let sortField = $state<SortField>("tvl");
  let sortDir = $state<SortDir>("desc");
  let selectedTiers = $state<Set<ToggleableTier>>(new Set());

  function toggleTier(tier: ToggleableTier) {
    const next = new Set(selectedTiers);
    if (next.has(tier)) next.delete(tier);
    else next.add(tier);
    selectedTiers = next;
    showAll = false;
  }

  const searching = $derived(query.trim().length > 0);
  const filtered = $derived(
    filterAndSortNodes(nodes, {
      tab,
      chainTab,
      query,
      showInactive,
      tiers: selectedTiers,
      sort: { field: sortField, dir: sortDir },
    }),
  );
  const visible = $derived(showAll ? filtered : filtered.slice(0, DEFAULT_PAGE));
  const showSort = $derived(!searching);

  function onSortClick(field: SortField) {
    if (sortField === field) {
      sortDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      sortField = field;
      sortDir = field === "tvl" || field === "risks" || field === "stage" ? "desc" : "asc";
    }
  }

  function arrow(field: SortField): string {
    const isActive = showSort && sortField === field;
    return isActive ? (sortDir === "asc" ? "\u2191" : "\u2193") : "\u2195";
  }

  function ariaSort(field: SortField): "ascending" | "descending" | "none" {
    const isActive = showSort && sortField === field;
    return isActive ? (sortDir === "asc" ? "ascending" : "descending") : "none";
  }

  function pizzaPaths(grades: PizzaGrades, size: PizzaSize) {
    const radius = size === "sm" ? 18 : 72;
    const stroke = size === "sm" ? 2 : 3;
    const cr = size === "sm" ? 1.5 : 5;
    const cx = radius, cy = radius;
    const angle = (2 * Math.PI) / PIZZA_SLICES.length;
    const da = Math.min(cr / radius, angle / 2 - 0.01);
    return {
      radius,
      stroke,
      paths: PIZZA_SLICES.map((slice, i) => {
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
      }),
    };
  }
</script>

<section>
  <TierGradients />
  <nav class="tabs" aria-label="Category">
    {#each sortedCategoryTabs as t}
      {@const active = t === tab}
      {@const count = tabCounts[t] ?? 0}
      <button
        type="button"
        aria-pressed={active}
        class:active
        onclick={() => { tab = t; showAll = false; }}
      >
        {t}<span class="count">{count.toLocaleString()}</span>
      </button>
    {/each}
  </nav>
  <nav class="tabs chains" aria-label="Chain">
    {#each sortedChainRow as c}
      {@const active = c === chainTab}
      {@const tvl = chainTvl[c] ?? 0}
      <button
        type="button"
        aria-pressed={active}
        class:active
        onclick={() => { chainTab = c; showAll = false; }}
      >
        {c}{#if c !== "All"}<span class="count">{formatTvl(tvl)}</span>{/if}
      </button>
    {/each}
  </nav>

  <div class="controls">
    <input
      type="search"
      aria-label="Search protocols by name or category"
      placeholder="Search name or category"
      bind:value={query}
    />
    <label class="checkbox">
      <input type="checkbox" bind:checked={showInactive} />
      Show inactive
    </label>
  </div>

  <TierLegend selected={selectedTiers} onToggle={toggleTier} />

  <div class="scroll">
    <table>
      <colgroup>
        <col class="c-name" />
        <col class="c-risks" />
        <col class="c-stage" />
        <col class="c-chain" />
        <col class="c-type" />
        <col class="c-tvl" />
      </colgroup>
      <thead>
        <tr>
          <th class="sortable name-col">
            <button type="button" onclick={() => showSort && onSortClick("name")} disabled={!showSort} aria-sort={ariaSort("name")}
              class:is-active={showSort && sortField === "name"}>
              Name<span class="arrow">{arrow("name")}</span>
            </button>
          </th>
          <th class="sortable">
            <button type="button" onclick={() => showSort && onSortClick("risks")} disabled={!showSort} aria-sort={ariaSort("risks")}
              class:is-active={showSort && sortField === "risks"}>
              Risks<span class="arrow">{arrow("risks")}</span>
            </button>
          </th>
          <th class="sortable">
            <button type="button" onclick={() => showSort && onSortClick("stage")} disabled={!showSort} aria-sort={ariaSort("stage")}
              class:is-active={showSort && sortField === "stage"}>
              Stage<span class="arrow">{arrow("stage")}</span>
            </button>
          </th>
          <th class="sortable">
            <button type="button" onclick={() => showSort && onSortClick("chain")} disabled={!showSort} aria-sort={ariaSort("chain")}
              class:is-active={showSort && sortField === "chain"}>
              Chain<span class="arrow">{arrow("chain")}</span>
            </button>
          </th>
          <th class="sortable">
            <button type="button" onclick={() => showSort && onSortClick("type")} disabled={!showSort} aria-sort={ariaSort("type")}
              class:is-active={showSort && sortField === "type"}>
              Type<span class="arrow">{arrow("type")}</span>
            </button>
          </th>
          <th class="sortable right">
            <button type="button" onclick={() => showSort && onSortClick("tvl")} disabled={!showSort} aria-sort={ariaSort("tvl")}
              class:is-active={showSort && sortField === "tvl"}>
              TVL<span class="arrow">{arrow("tvl")}</span>
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        {#each visible as node, i (node.slug)}
          {@const isFamily = !!(node.children && node.children.length > 0)}
          {@const isExp = !!expanded[node.slug]}
          {@render row(node, isFamily, isExp, false)}
          {#if isFamily && isExp}
            {#each node.children ?? [] as child (child.slug)}
              {@render row(child, false, false, true)}
            {/each}
          {/if}
        {/each}
      </tbody>
    </table>
  </div>

  <div class="pager">
    <span class="muted">Showing {visible.length.toLocaleString()} of {filtered.length.toLocaleString()}</span>
    {#if filtered.length > DEFAULT_PAGE}
      <button type="button" class="show-all" onclick={() => { showAll = !showAll; }}>
        {showAll ? "Collapse to top 200" : "Show all"}
      </button>
    {/if}
  </div>
</section>

{#snippet row(row: LandingNode, isFamilyHead: boolean, isExpanded: boolean, isChild: boolean)}
  {@const extraChains = Math.max(0, row.chains.length - 1)}
  {@const grades = { ...pizzaGradesFor(row.category, row.verifiability_grade, row.autonomy_grade), ...(row.assessment_grades ?? {}) }}
  {@const pz = pizzaPaths(grades, "sm")}
  {@const initial = row.name.charAt(0).toUpperCase()}
  {@const tier = row.tier ?? "none"}
  <tr class:child={isChild}>
    <td class="name-cell" class:child-cell={isChild}>
      <div class="name-inner">
        {#if isFamilyHead}
          <button
            type="button"
            onclick={() => { expanded = { ...expanded, [row.slug]: !expanded[row.slug] }; }}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? "Collapse family" : "Expand family"}
            class="toggle"
          >{isExpanded ? "\u25BE" : "\u25B8"}</button>
        {:else if !isChild}
          <span class="toggle-placeholder" aria-hidden="true"></span>
        {/if}
        <span class="logo" aria-hidden="true" style="width:20px;height:20px;font-size:11px">
          {initial}
          {#if row.logo}
            <img src={row.logo} alt="" loading="lazy" decoding="async" width="20" height="20" />
          {/if}
        </span>
        <a href={`/protocol/${row.slug}`} class="name-link" title={row.name}>{row.name}</a>
        {#if isFamilyHead}
          <span class="muted small-pad">({row.children?.length ?? 0})</span>
        {/if}
        {#if row.is_dead}
          <span class="muted small-pad">(inactive)</span>
        {/if}
      </div>
    </td>
    <td class="pizza-cell">
      <div class="pizza-wrap">
        <svg width={pz.radius * 2} height={pz.radius * 2} viewBox={`0 0 ${pz.radius * 2} ${pz.radius * 2}`} role="img" aria-label="risk pizza (all unknown)">
          {#each pz.paths as p}
            <a href={`/protocol/${row.slug}`}>
              <path d={p.d} fill={p.fill} stroke="#08090c" stroke-width={pz.stroke} stroke-linejoin="round">
                <title>{`${p.label} \u2014 ${p.tooltip}`}</title>
              </path>
            </a>
          {/each}
          <circle
            cx={pz.radius}
            cy={pz.radius}
            r={pz.radius}
            fill="url(#pie-ao)"
            style="mix-blend-mode: multiply"
            pointer-events="none"
          />
        </svg>
      </div>
    </td>
    <td class="stage-cell">
      {#if tier !== "none"}
        <a class="tt-wrap audit-cta" href={`/protocol/${row.slug}#audit-yourself`} aria-label={`${TIER_LABEL[tier]} — contribute another run`}>
          <TierMedal tier={tier} size={20} />
          <span class="tt" role="tooltip">{TIER_LABEL[tier]} · contribute a run</span>
        </a>
      {:else}
        <a class="tt-wrap audit-cta" href={`/protocol/${row.slug}#audit-yourself`} aria-label="Be the first to audit this protocol">
          <svg class="audit-plus" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="2 2" />
            <path d="M10 6 L10 14 M6 10 L14 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
          <span class="tt" role="tooltip">Be the first to audit · copy a prompt</span>
        </a>
      {/if}
    </td>
    <td>
      {row.primary_chain ?? EM_DASH}
      {#if extraChains > 0}
        <span class="extra-chains">+{extraChains}</span>
      {/if}
    </td>
    <td>{row.category || EM_DASH}</td>
    <td class="tvl mono tabular">{formatTvl(row.tvl)}</td>
  </tr>
{/snippet}

<style>
  section { display: block; }
  .tabs {
    display: flex;
    gap: 0.25rem;
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
    margin-left: -1.5rem;
    margin-right: -1.5rem;
    padding: 0 1.5rem 0.25rem;
    margin-bottom: 1rem;
  }
  .tabs::-webkit-scrollbar { display: none; }
  .tabs button { flex-shrink: 0; }
  .tabs.chains { margin-top: -0.5rem; }
  .tabs.chains button { background: transparent; }
  .tabs button {
    min-height: 44px;
    padding: 0 0.9rem;
    border: none;
    border-radius: 4px 4px 0 0;
    background: var(--surface);
    color: var(--text-muted);
    cursor: pointer;
    font-size: 0.85rem;
    box-shadow: inset 0 -2px 0 0 transparent;
    transition: color 120ms ease-out, background-color 120ms ease-out, box-shadow 120ms ease-out;
  }
  .tabs button:hover { color: var(--text); }
  .tabs button.active {
    background: var(--surface-raised);
    color: var(--text);
    box-shadow: inset 0 -2px 0 0 var(--brand-oxblood);
  }
  .count { opacity: 0.6; margin-left: 4px; }
  .controls {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-bottom: 0.75rem;
    align-items: center;
  }
  .controls input[type="search"] {
    flex: 1 1 18rem;
    min-height: 44px;
    padding: 0 0.75rem;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--surface-raised);
    border-radius: 4px;
    font-size: 0.9rem;
  }
  .checkbox {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    color: var(--text-muted);
    font-size: 0.85rem;
  }
  .scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  table {
    width: 100%;
    border-collapse: collapse;
    color: var(--text);
    font-size: 0.9rem;
    table-layout: fixed;
  }
  col.c-name { width: auto; }
  col.c-risks { width: 4.5rem; }
  col.c-stage { width: 4.5rem; }
  col.c-chain { width: 10rem; }
  col.c-type { width: 9rem; }
  col.c-tvl { width: 7rem; }
  @media (max-width: 960px) {
    .scroll {
      margin-left: -1.5rem;
      margin-right: -1.5rem;
    }
    table { table-layout: auto; min-width: 710px; width: max-content; }
    th, td { white-space: nowrap; }
    th:first-child, td:first-child { padding-left: 1.5rem; }
    th:last-child, td:last-child { padding-right: 1.5rem; }
    col.c-name { width: 15rem; }
    td.name-cell { max-width: 15rem; }
  }
  thead tr { text-align: left; color: var(--text-muted); font-size: 0.8rem; }
  th { padding: 0.45rem 0.6rem; font-weight: 500; }
  th.rank { width: 3rem; }
  th.sortable { padding: 0; }
  th.right { text-align: right; }
  th.sortable button {
    background: transparent;
    border: none;
    padding: 0.45rem 0.6rem;
    min-height: 44px;
    width: 100%;
    text-align: left;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 500;
    opacity: 0.5;
  }
  th.sortable button:enabled { opacity: 1; }
  th.sortable button.is-active { color: var(--text); }
  th.sortable.right button { text-align: right; }
  th.name-col button { padding-left: calc(0.6rem + 44px + 6px); }
  .arrow { margin-left: 4px; opacity: 0.4; }
  th.sortable button.is-active .arrow { opacity: 1; }
  tbody tr { border-top: 1px solid var(--surface-raised); }
  tbody tr.child { background: var(--surface); }
  td { padding: 0.45rem 0.6rem; }
  .rank-cell { color: var(--text-muted); }
  .name-cell.child-cell { padding-left: 2rem; }
  .toggle {
    box-sizing: border-box;
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    margin-right: 6px;
    padding: 0.6rem;
    min-width: 44px;
    min-height: 44px;
    font-size: 0.85rem;
    text-align: center;
    vertical-align: middle;
  }
  .toggle-placeholder {
    display: inline-block;
    width: 44px;
    margin-right: 6px;
    vertical-align: middle;
  }
  .logo {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    background: var(--surface-raised);
    color: var(--text-muted);
    font-weight: 500;
    flex-shrink: 0;
    overflow: hidden;
    position: relative;
    vertical-align: middle;
  }
  .logo img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .name-cell > .name-inner { display: flex; align-items: center; min-width: 0; }
  .name-link {
    text-decoration: none;
    margin-left: 8px;
    color: var(--accent-link);
    flex: 1 1 0;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .muted { color: var(--text-muted); }
  .small-pad { margin-left: 6px; font-size: 0.75rem; }
  .extra-chains {
    margin-left: 6px;
    padding: 0 0.4rem;
    background: var(--surface-raised);
    border-radius: 999px;
    color: var(--text-muted);
    font-size: 0.7rem;
  }
  .pizza-cell { padding: 0.2rem 0.6rem; }
  .pizza-wrap {
    position: relative;
    display: inline-block;
    line-height: 0;
  }
  .stage-cell {
    text-align: center;
    line-height: 0;
  }
  .tt-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .tt-wrap .tt {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%) translateY(-2px);
    background: var(--surface-raised);
    color: var(--text);
    padding: 0.3rem 0.55rem;
    border-radius: 4px;
    border: 1px solid var(--surface-raised);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
    font-size: 0.72rem;
    font-weight: 500;
    line-height: 1.3;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition: opacity 80ms ease-out, transform 80ms ease-out;
    z-index: 100;
  }
  .tt-wrap .tt::after {
    content: "";
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 4px solid transparent;
    border-top-color: var(--surface-raised);
  }
  .tt-wrap:hover .tt,
  .tt-wrap:focus-within .tt {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
  .audit-cta {
    color: var(--text-muted);
    opacity: 0.55;
    transition: opacity 120ms ease-out, color 120ms ease-out;
  }
  .audit-cta:hover,
  .audit-cta:focus-visible {
    color: var(--accent-link);
    opacity: 1;
  }
  .audit-plus { display: block; }
  .tvl {
    text-align: right;
    font-family: var(--font-mono), ui-monospace, monospace;
    font-variant-numeric: tabular-nums;
  }
  .pager {
    margin-top: 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .show-all {
    background: transparent;
    border: 1px solid var(--surface-raised);
    color: var(--accent-link);
    min-height: 44px;
    padding: 0 0.9rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85rem;
  }
</style>
