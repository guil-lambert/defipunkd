// Shared helpers: data lookup (live fetch + fallback index), slug resolution,
// SPA-navigation watcher, idempotency. Exposes globalThis.DPKC.
// On boot, seeds INDEX from DEFIPUNKD_INDEX_FALLBACK; then asynchronously
// replaces it with live data from the background service worker (GET_INDEX).
(function () {
  "use strict";

  // Mutable in-memory index, seeded from the bundled fallback.
  let INDEX = globalThis.DEFIPUNKD_INDEX_FALLBACK || {};

  // Module-level handle so live-index arrival can trigger a re-render.
  let rerender = null;

  // Per-slug detail cache (slug → full ProtocolRecord or null).
  const detailCache = new Map();

  // --- data layer ---

  function lookup(slug) {
    if (!slug) return null;
    return INDEX[slug] || null;
  }

  function sendMessage(msg) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }

  // Returns a promise of the full ProtocolRecord (or null). Caches the PROMISE
  // so the many early mutation ticks on a protocol page dedupe to one GET_DETAIL.
  function getDetail(slug) {
    if (!slug) return Promise.resolve(null);
    if (detailCache.has(slug)) return detailCache.get(slug);
    const p = sendMessage({ type: "GET_DETAIL", slug }).catch(() => null);
    detailCache.set(slug, p);
    return p;
  }

  // --- slug helpers ---

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

    // Capture schedule so live-index arrival can trigger a re-render.
    rerender = schedule;

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
    getDetail,
    slugFromHref,
    currentProtocolSlug,
    slugFromRow,
    claim,
    observe,
  };

  // On boot: fetch live index from the background worker and override the
  // fallback. Guard rerender — observe() is called by inject-protocol.js which
  // loads after common.js; if it hasn't run yet the initial schedule still
  // paints correctly from the fallback.
  sendMessage({ type: "GET_INDEX" })
    .then((idx) => {
      if (idx && typeof idx === "object" && Object.keys(idx).length) {
        INDEX = idx;
        if (rerender) rerender();
      }
    })
    .catch(() => {});
})();
