// Shared helpers: data lookup, slug resolution, SPA-navigation watcher,
// idempotency. Exposes globalThis.DPKC
(function () {
  "use strict";

  const DATA = globalThis.DEFIPUNKD_DATA || {};

  function lookup(slug) {
    if (!slug) return null;
    return DATA[slug] || null;
  }

  // /protocol/<slug>  ->  <slug>  (strip query/hash and any trailing segments)
  function slugFromHref(href) {
    if (!href) return null;
    let path = href;
    try {
      path = new URL(href, location.origin).pathname;
    } catch {
      /* relative already */
    }
    const m = path.match(/^\/protocol\/([^/?#]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function currentProtocolSlug() {
    return slugFromHref(location.pathname);
  }

  function slugFromRow(rowEl) {
    const a = rowEl.querySelector('a[href*="/protocol/"]');
    return a ? slugFromHref(a.getAttribute("href")) : null;
  }

  // Mark/skip already-processed nodes.
  function claim(el, key) {
    const attr = "data-dpk" + (key ? "-" + key : "");
    if (el.hasAttribute(attr)) return false;
    el.setAttribute(attr, "1");
    return true;
  }

  // Run cb now, on DOM mutations (debounced), and on SPA route changes.
  // DeFiLlama is a Next.js SPA: pushState/replaceState don't reload.
  function observe(cb) {
    let scheduled = false;
    const run = () => {
      scheduled = false;
      try {
        cb();
      } catch (e) {
        console.error("[DeFiPunkd] inject error:", e);
      }
    };
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(run);
    };

    // Mutation observer for re-renders / virtualized rows.
    const mo = new MutationObserver(schedule);
    mo.observe(document.documentElement, { childList: true, subtree: true });

    // Patch history for SPA navigations.
    const fire = () => schedule();
    for (const m of ["pushState", "replaceState"]) {
      const orig = history[m];
      history[m] = function () {
        const r = orig.apply(this, arguments);
        fire();
        return r;
      };
    }
    window.addEventListener("popstate", fire);

    schedule();
  }

  globalThis.DPKC = {
    lookup,
    slugFromHref,
    currentProtocolSlug,
    slugFromRow,
    claim,
    observe,
  };
})();
