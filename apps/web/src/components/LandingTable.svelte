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

  const searching = $derived(query.trim().length > 0);
  const filtered = $derived(
    filterAndSortNodes(nodes, {
      tab,
      chainTab,
      query,
      showInactive,
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
      sortDir = field === "tvl" ? "desc" : "asc";
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
    const stroke = size === "sm" ? 1 : 2;
    const cx = radius, cy = radius;
    const angle = (2 * Math.PI) / PIZZA_SLICES.length;
    return {
      radius,
      stroke,
      paths: PIZZA_SLICES.map((slice, i) => {
        const a0 = -Math.PI / 2 + i * angle;
        const a1 = a0 + angle;
        const x0 = cx + radius * Math.cos(a0);
        const y0 = cy + radius * Math.sin(a0);
        const x1 = cx + radius * Math.cos(a1);
        const y1 = cy + radius * Math.sin(a1);
        const grade = grades[slice.id] ?? "gray";
        return {
          id: slice.id,
          label: slice.label,
          d: `M${cx},${cy} L${x0},${y0} A${radius},${radius} 0 0,1 ${x1},${y1} Z`,
          fill: GRADE_FILL[grade],
          tooltip: GRADE_TOOLTIP[grade],
        };
      }),
    };
  }
</script>

<section>
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
      aria-label="Search protocols by name, slug, or category"
      placeholder="Search name, slug, category"
      bind:value={query}
    />
    <label class="checkbox">
      <input type="checkbox" bind:checked={showInactive} />
      Show inactive
    </label>
  </div>

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
          <th>Risks</th>
          <th>Stage</th>
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
  {@const grades = pizzaGradesFor(row.category, row.verifiability_grade, row.dependencies_grade)}
  {@const pz = pizzaPaths(grades, "sm")}
  {@const initial = row.name.charAt(0).toUpperCase()}
  <tr class:child={isChild}>
    <td class="name-cell" class:child-cell={isChild}>
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
      <a href={`/protocol/${row.slug}`} class="name-link">{row.name}</a>
      {#if isFamilyHead}
        <span class="muted small-pad">({row.children?.length ?? 0})</span>
      {/if}
      {#if row.is_dead}
        <span class="muted small-pad">(inactive)</span>
      {/if}
    </td>
    <td class="pizza-cell">
      <svg width={pz.radius * 2} height={pz.radius * 2} viewBox={`0 0 ${pz.radius * 2} ${pz.radius * 2}`} role="img" aria-label="risk pizza (all unknown)">
        {#each pz.paths as p}
          <a href={`/protocol/${row.slug}`}>
            <path d={p.d} fill={p.fill} stroke="#08090c" stroke-width={pz.stroke}>
              <title>{`${p.label} \u2014 ${p.tooltip}`}</title>
            </path>
          </a>
        {/each}
      </svg>
    </td>
    <td class="muted">{EM_DASH}</td>
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
  .tabs.chains button { background: transparent; border: 1px solid var(--surface-raised); }
  .tabs.chains button.active { background: var(--accent-link); color: var(--bg); border-color: var(--accent-link); }
  .tabs button {
    min-height: 44px;
    padding: 0 0.9rem;
    border: none;
    border-radius: 4px;
    background: var(--surface-raised);
    color: var(--text);
    cursor: pointer;
    font-size: 0.85rem;
  }
  .tabs button.active { background: var(--accent-link); color: var(--bg); }
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
    table { table-layout: auto; min-width: 760px; width: max-content; }
    th, td { white-space: nowrap; }
    th:first-child, td:first-child { padding-left: 1.5rem; }
    th:last-child, td:last-child { padding-right: 1.5rem; }
    col.c-name { width: 18rem; }
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
  .name-link { text-decoration: none; margin-left: 8px; color: var(--accent-link); }
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
