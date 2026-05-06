<script lang="ts">
  type Deployment = { slug: string; name: string };
  type Section = { id: string; label: string };

  let { deployments, sharedSections }: { deployments: Deployment[]; sharedSections: Section[] } = $props();

  // Match the order the slice cards are sorted into in RiskAnalysis.astro so
  // the side-nav reads top-to-bottom in the same sequence the user scrolls.
  const SLICES = [
    { id: "verifiability", label: "Verifiability" },
    { id: "control", label: "Control" },
    { id: "ability-to-exit", label: "Ability to exit" },
    { id: "autonomy", label: "Autonomy" },
    { id: "open-access", label: "Open Access" },
  ];

  let activeSlug = $state("");
  let activeAnchor = $state<string>("");

  function resolveSlugFromHash(): string | null {
    const h = window.location.hash.slice(1);
    if (!h) return null;
    if (deployments.some((d) => d.slug === h)) return h;
    const sorted = [...deployments].sort((a, b) => b.slug.length - a.slug.length);
    const m = sorted.find((d) => h.startsWith(`${d.slug}-`));
    return m?.slug ?? null;
  }

  function syncFromHash() {
    const fromHash = resolveSlugFromHash();
    activeSlug = fromHash ?? deployments[0]?.slug ?? "";
  }

  $effect(() => {
    syncFromHash();

    const collectSections = (): { id: string; el: HTMLElement }[] => {
      const ids = [
        "deployments",
        activeSlug,
        `${activeSlug}-risk-analysis`,
        ...SLICES.map((s) => `${activeSlug}-${s.id}`),
        `${activeSlug}-stage`,
        `${activeSlug}-tvl-surface`,
        ...sharedSections.map((s) => s.id),
      ];
      const out: { id: string; el: HTMLElement }[] = [];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el) out.push({ id, el });
      }
      return out;
    };

    const setActive = () => {
      const line = window.innerHeight * 0.25;
      let chosen: string | null = null;
      for (const { id, el } of collectSections()) {
        if (el.getBoundingClientRect().top <= line) chosen = id;
      }
      activeAnchor = chosen ?? "";
    };

    let queued = false;
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        setActive();
      });
    };

    window.addEventListener("hashchange", syncFromHash);
    window.addEventListener("popstate", syncFromHash);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    setActive();

    return () => {
      window.removeEventListener("hashchange", syncFromHash);
      window.removeEventListener("popstate", syncFromHash);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  });

  let activeName = $derived(deployments.find((d) => d.slug === activeSlug)?.name ?? "");
</script>

<aside class="side-nav" aria-label="Page sections">
  <a href="/" class="brand" aria-label="DeFiPunk'd — back to index">
    <span class="brand-arrow" aria-hidden="true">←</span>
    <svg class="brand-logo" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M3 3h4v2h-2v6h2v2h-4zM13 3h-4v2h2v6h-2v2h4zM7 6h2v2h-2zM7 9h2v2h-2z" fill="currentColor"/>
    </svg>
    <span class="brand-word">DeFiPunk'<span class="brand-mark">d</span></span>
  </a>
  <div class="nav-links">
    <a href="#deployments" class:active={activeAnchor === "deployments"}>Deployments</a>
    {#if activeSlug && activeName}
      <a href={`#${activeSlug}`} class="indent-1" class:active={activeAnchor === activeSlug}>{activeName}</a>
      <a href={`#${activeSlug}-risk-analysis`} class="indent-2" class:active={activeAnchor === `${activeSlug}-risk-analysis`}>Risk analysis</a>
      {#each SLICES as s}
        <a href={`#${activeSlug}-${s.id}`} class="indent-3" class:active={activeAnchor === `${activeSlug}-${s.id}`}>{s.label}</a>
      {/each}
      <a href={`#${activeSlug}-stage`} class="indent-2" class:active={activeAnchor === `${activeSlug}-stage`}>Stage</a>
      <a href={`#${activeSlug}-tvl-surface`} class="indent-2" class:active={activeAnchor === `${activeSlug}-tvl-surface`}>Contract surface</a>
    {/if}
    {#each sharedSections as s}
      <a href={`#${s.id}`} class:active={activeAnchor === s.id}>{s.label}</a>
    {/each}
  </div>
</aside>

<style>
  .side-nav {
    position: fixed;
    top: 5rem;
    left: max(1rem, calc(50% - 550px - 1in - 170px));
    width: 170px;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem 0.9rem;
    background: var(--surface);
    border: 1px solid var(--surface-raised);
    border-radius: 4px;
    z-index: 10;
  }
  @media (max-width: 1400px) {
    .side-nav { display: none !important; }
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    color: var(--text);
    text-decoration: none;
    font-size: 1rem;
    font-weight: 600;
    line-height: 1;
    letter-spacing: -0.02em;
    min-width: 0;
  }
  .brand-word { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .brand:hover { color: var(--text); }
  .brand-arrow { color: var(--text-muted); font-weight: 500; }
  .brand:hover .brand-arrow { color: var(--text); }
  .brand-logo { width: 1em; height: 1em; flex-shrink: 0; color: var(--brand-oxblood); }
  .brand-mark { color: var(--brand-oxblood); }

  .nav-links {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding-top: 0.75rem;
    margin-top: 0.25rem;
    border-top: 1px solid var(--surface-raised);
  }
  .nav-links a {
    color: var(--text-muted);
    text-decoration: none;
    font-size: 0.8rem;
    letter-spacing: 0.02em;
    padding: 0.1rem 0 0.1rem 0.55rem;
    margin-left: -0.55rem;
    box-shadow: inset 2px 0 0 0 transparent;
    transition: color 120ms ease-out, box-shadow 120ms ease-out;
  }
  .nav-links a.indent-1 {
    padding-left: 1.1rem;
    color: var(--text);
    font-weight: 600;
  }
  .nav-links a.indent-2 {
    padding-left: 1.7rem;
    font-size: 0.78rem;
  }
  .nav-links a.indent-3 {
    padding-left: 2.3rem;
    font-size: 0.76rem;
  }
  .nav-links a:hover { color: var(--text); }
  .nav-links a.active {
    color: var(--text);
    box-shadow: inset 2px 0 0 0 var(--brand-oxblood);
  }
</style>
