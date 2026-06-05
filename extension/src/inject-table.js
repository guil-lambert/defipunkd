// Surface 1: in-cell badge on the Protocol Rankings table.
// We don't add a real column (DeFiLlama's table is React + virtualized); instead
// we append a small pizza badge next to each protocol's name link.
(function () {
  "use strict";
  const { lookup, slugFromHref, claim } = globalThis.DPKC;
  const { renderBadge } = globalThis.DPK;

  // Name links in the rankings rows. Anything with /protocol/ in the href and
  // visible text (skips the logo-only link). Tweak here if DeFiLlama changes.
  const NAME_LINK = 'a[href*="/protocol/"]';

  function injectTable() {
    const links = document.querySelectorAll(NAME_LINK);
    for (const a of links) {
      // Skip our own elements and links without a text label (e.g. logo links).
      if (a.closest(".dpk-badge") || a.closest(".dpk-panel") || a.closest(".dpk-streamlined")) continue;
      if (!a.textContent || !a.textContent.trim()) continue;

      const slug = slugFromHref(a.getAttribute("href"));
      const record = lookup(slug);
      if (!record) continue;
      if (!claim(a, "tablebadge")) continue;

      const badge = renderBadge(record, slug, 28);
      // Right-align: pin the pizza to the right edge of the Name cell, vertically
      // centered. Absolute positioning avoids the name link's truncation clip
      // (e.g. "Babylon Protocol…") and lines every row's pizza up at the column
      // divider. Fall back to inline-after-name if no cell ancestor is found.
      const cell = a.closest('td, [role="cell"], [role="gridcell"]');
      if (cell) {
        badge.classList.add("dpk-badge-abs");
        if (window.getComputedStyle(cell).position === "static") cell.style.position = "relative";
        // Reserve space on the right so long names (e.g. "Binance staked ETH")
        // truncate/wrap instead of running under the absolutely-pinned pizza.
        cell.style.paddingRight = "48px";
        cell.appendChild(badge);
      } else {
        // Inline contexts (e.g. the "Competitors" list): nest the badge INSIDE
        // the name link so it hugs that protocol's name. A separate sibling
        // would pick up the flex row-gap on both sides and float ambiguously
        // between two names. The badge stops click propagation, so it opens
        // DeFiPunk'd without triggering the link's own navigation.
        badge.style.marginLeft = "4px";
        a.appendChild(badge);
      }
    }
  }

  globalThis.DPK_injectTable = injectTable;
})();
