<script lang="ts">
  import { formatTvl } from "../lib/format";
  import type { Tier } from "../lib/tier";
  import type { PizzaGrades } from "../lib/pizza";
  import TierMedal from "./TierMedal.svelte";
  import MiniPizza from "./MiniPizza.svelte";

  type Deployment = { slug: string; name: string; category: string; tvl: number | null; tier: Tier; grades: PizzaGrades };

  let { deployments }: { deployments: Deployment[] } = $props();

  let active = $state("");

  function setPanelVisibility(slug: string) {
    const panels = document.querySelectorAll<HTMLElement>(".deployment-panel");
    for (const el of panels) {
      el.hidden = el.dataset.slug !== slug;
    }
  }

  function activate(slug: string, opts: { pushHash?: boolean; scroll?: boolean } = {}) {
    if (!deployments.some((d) => d.slug === slug)) return;
    active = slug;
    setPanelVisibility(slug);
    if (opts.pushHash && window.location.hash.slice(1) !== slug) {
      const oldURL = window.location.href;
      history.pushState(null, "", `#${slug}`);
      // pushState does not fire hashchange; dispatch one so other islands
      // (FamilySideNav) re-sync to the new active tab.
      window.dispatchEvent(new HashChangeEvent("hashchange", { oldURL, newURL: window.location.href }));
    }
    if (opts.scroll) {
      const tabs = document.querySelector<HTMLElement>(".deployment-tabs");
      tabs?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function resolveSlug(h: string): string | null {
    if (!h) return null;
    if (deployments.some((d) => d.slug === h)) return h;
    // Longest-prefix match so e.g. #sky-rwa-verifiability activates sky-rwa
    // even when a shorter sibling slug ("sky") exists in the family.
    const sorted = [...deployments].sort((a, b) => b.slug.length - a.slug.length);
    return sorted.find((d) => h.startsWith(`${d.slug}-`))?.slug ?? null;
  }

  $effect(() => {
    const hash = window.location.hash.slice(1);
    const initial = resolveSlug(hash) ?? deployments[0]?.slug;
    if (initial) activate(initial, { pushHash: false, scroll: hash === initial });

    const onHashOrPop = () => {
      const h = window.location.hash.slice(1);
      const slug = resolveSlug(h);
      if (slug) activate(slug, { pushHash: false, scroll: false });
    };
    window.addEventListener("hashchange", onHashOrPop);
    window.addEventListener("popstate", onHashOrPop);
    return () => {
      window.removeEventListener("hashchange", onHashOrPop);
      window.removeEventListener("popstate", onHashOrPop);
    };
  });
</script>

<div class="deployment-tabs" role="tablist" aria-label="Deployments">
  {#each deployments as d (d.slug)}
    <button
      type="button"
      role="tab"
      aria-selected={active === d.slug}
      aria-controls={`panel-${d.slug}`}
      class="tab"
      class:active={active === d.slug}
      onclick={() => activate(d.slug, { pushHash: true, scroll: false })}
    >
      <span class="tab-head">
        <MiniPizza grades={d.grades} size={14} />
        {#if d.tier && d.tier !== "none"}
          <TierMedal tier={d.tier} size={16} />
        {/if}
        <span class="tab-name">{d.name}</span>
      </span>
      <span class="tab-meta">
        {d.category || "—"}{#if typeof d.tvl === "number"} · {formatTvl(d.tvl)}{/if}
      </span>
    </button>
  {/each}
</div>

<style>
  .deployment-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    padding: 0.25rem 0 0.75rem 0;
    border-bottom: 1px solid var(--surface-raised);
    margin-bottom: 1rem;
    scroll-margin-top: 1rem;
  }
  .tab {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.1rem;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--surface-raised);
    border-radius: 6px;
    padding: 0.5rem 0.85rem;
    font: inherit;
    cursor: pointer;
    text-align: left;
    transition: border-color 120ms ease, background 120ms ease;
  }
  .tab:hover { border-color: var(--accent-link); }
  .tab.active {
    border-color: var(--brand-oxblood);
    background: var(--surface-raised);
  }
  .tab-head { display: inline-flex; align-items: center; gap: 0.4rem; }
  .tab-name { font-weight: 600; font-size: 0.95rem; }
  .tab-meta { color: var(--text-muted); font-size: 0.8rem; }
</style>
