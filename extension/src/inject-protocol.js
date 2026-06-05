// Surfaces 2 & 3: protocol page (defillama.com/protocol/<slug>).
//  2. small pizza next to the bookmark icon in the header
//  3. full DeFiPunk'd panel near the top + streamlined block in "Protocol Information"
// Also wires the SPA observer that drives every surface.
(function () {
  "use strict";
  const { lookup, getDetail, currentProtocolSlug, claim, observe } = globalThis.DPKC;
  const { renderBadge, renderStreamlined } = globalThis.DPK;

  // Heuristics (tweak here if DeFiLlama changes their markup).
  const BOOKMARK_SELECTOR =
    'button[aria-label*="bookmark" i], button[aria-label*="watchlist" i], button[aria-label*="save" i], ' +
    '[role="button"][aria-label*="watchlist" i]';
  const INFO_HEADING_TEXT = "protocol information";

  function headerHeading() {
    // The protocol title heading, e.g. "Aave (AAVE)". First h1 is the safe bet.
    return document.querySelector("h1");
  }

  // --- surface 2: badge next to the bookmark icon ---
  function injectHeaderBadge(slug, record) {
    let anchorEl = document.querySelector(BOOKMARK_SELECTOR);
    // Fallback: a button sitting near the title heading.
    if (!anchorEl) {
      const h = headerHeading();
      if (h) {
        const scope = h.closest("div") || h.parentElement;
        if (scope) anchorEl = scope.querySelector("button, svg");
      }
    }
    if (!anchorEl) return;
    const host = anchorEl.parentElement || anchorEl;
    if (!claim(host, "headerbadge")) return;
    const badge = renderBadge(record, slug, 30);
    anchorEl.insertAdjacentElement("afterend", badge);
  }

  // --- surface 3: streamlined block inside "Protocol Information" ---
  // Rendered first from the lightweight index (pizza + tier + risk-matrix grades),
  // then upgraded in place once the live detail arrives (adds per-slice headlines +
  // family tabs). `isDetail` marks the richer version so we never downgrade it.
  function injectStreamlined(slug, record, isDetail) {
    const headings = document.querySelectorAll("h1, h2, h3, h4");
    let infoCard = null;
    for (const el of headings) {
      if ((el.textContent || "").trim().toLowerCase() === INFO_HEADING_TEXT) {
        infoCard = el.parentElement;
        break;
      }
    }
    if (!infoCard) return;
    const existing = infoCard.querySelector(":scope > .dpk-streamlined");
    if (existing) {
      // Keep the detail version; skip re-rendering the index version over it.
      if (!isDetail || existing.getAttribute("data-dpk-detail") === "1") return;
      existing.remove();
    }
    const node = renderStreamlined(record, slug);
    if (isDetail) node.setAttribute("data-dpk-detail", "1");
    infoCard.appendChild(node);
  }

  function injectProtocol() {
    const slug = currentProtocolSlug();
    if (!slug) return;
    const idx = lookup(slug);
    if (!idx) return;                 // not an assessed protocol — do nothing
    injectHeaderBadge(slug, idx);     // badge only needs tier + slices (index has them)
    injectStreamlined(slug, idx, false); // paint immediately from the index (offline-safe)
    getDetail(slug).then((detail) => {
      if (detail) injectStreamlined(slug, detail, true); // enrich: headlines + family tabs
    });
  }

  // Single observer drives both the table and protocol surfaces.
  observe(function () {
    if (globalThis.DPK_injectTable) globalThis.DPK_injectTable();
    injectProtocol();
  });
})();
