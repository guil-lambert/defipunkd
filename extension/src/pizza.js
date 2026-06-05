// DeFiPunkd pizza renderer — vanilla SVG, no dependencies.
// Ported from apps/web/src/components/ProtocolSummary.astro (pizza geometry),
// TierMedal.svelte (medal glyphs) and lib/pizza.ts / lib/tier.ts (colors).
// Exposes a single global: globalThis.DPK
(function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";

  // ---- colors (lib/pizza.ts) ----
  const GRADE_FILL = {
    gray: "oklch(0.55 0.015 235)",
    green: "oklch(0.60 0.130 150)",
    orange: "oklch(0.65 0.120 75)",
    red: "oklch(0.52 0.170 22)",
  };
  const GRADE_CHIP = {
    gray: "#6b7280",
    green: "#3fa46a",
    orange: "#c98a2e",
    red: "#c0453a",
  };

  // ---- tier gradients / colors (lib/tier.ts) ----
  const TIER_STOPS = {
    wood: [["0%", "#A89684"], ["50%", "#7C6B58"], ["100%", "#4E4338"]],
    bronze: [["0%", "#E8B896"], ["50%", "#B8763E"], ["100%", "#7A4A1E"]],
    silver: [["0%", "#E8E8EC"], ["50%", "#A8A8B0"], ["100%", "#6C6C74"]],
    gold: [["0%", "#FFE69A"], ["50%", "#D4A84A"], ["100%", "#8A6A1E"]],
  };
  const TIER_RIM = { wood: "#4E4338", bronze: "#7A4A1E", silver: "#6C6C74", gold: "#8A6A1E" };
  const TIER_CHECK = { wood: "#2C2620", bronze: "#5A3715", silver: "#4A4A52", gold: "#5A4410" };
  const TIER_LABEL = {
    wood: "Wood tier · At least one model submission, no quorum yet",
    bronze: "Bronze tier · AI consensus on at least one dimension",
    silver: "Silver tier · Weak AI consensus on all dimensions",
    gold: "Gold tier · Strong AI consensus on all dimensions",
  };
  const MEDAL_CHECK_MIN = 12;

  const SLICE_ORDER = ["control", "ability-to-exit", "autonomy", "open-access", "verifiability"];
  const SHORT_LABEL = {
    control: "Control",
    "ability-to-exit": "Exit",
    autonomy: "Autonomy",
    "open-access": "Open Access",
    verifiability: "Verifiable",
  };

  let uid = 0;
  const nextId = () => `dpk-${++uid}`;

  function svgEl(tag, attrs, children) {
    const e = document.createElementNS(SVG_NS, tag);
    if (attrs) for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, String(attrs[k]));
    if (children) for (const c of children) if (c) e.appendChild(c);
    return e;
  }
  function htmlEl(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs)
      for (const k in attrs) {
        if (attrs[k] == null) continue;
        if (k === "class") e.className = attrs[k];
        else if (k === "text") e.textContent = attrs[k];
        else e.setAttribute(k, String(attrs[k]));
      }
    if (children) for (const c of children) if (c) e.appendChild(c);
    return e;
  }

  // ---- pizza wedge geometry (ProtocolSummary.astro:78-107, generalized) ----
  function pizzaPaths(slices, view, radius, cr, tipR) {
    const center = view / 2;
    const n = slices.length;
    const a = (2 * Math.PI) / n;
    return slices.map((s, i) => {
      const a0 = -Math.PI / 2 + i * a;
      const a1 = a0 + a;
      const aMid = a0 + a / 2;
      const da = Math.min(cr / radius, a / 2 - 0.01);
      const Ax = center + (radius - cr) * Math.cos(a0);
      const Ay = center + (radius - cr) * Math.sin(a0);
      const Bx = center + radius * Math.cos(a0 + da);
      const By = center + radius * Math.sin(a0 + da);
      const Cx = center + radius * Math.cos(a1 - da);
      const Cy = center + radius * Math.sin(a1 - da);
      const Dx = center + (radius - cr) * Math.cos(a1);
      const Dy = center + (radius - cr) * Math.sin(a1);
      const Tx0 = center + tipR * Math.cos(a0);
      const Ty0 = center + tipR * Math.sin(a0);
      const Tx1 = center + tipR * Math.cos(a1);
      const Ty1 = center + tipR * Math.sin(a1);
      const f = (x) => x.toFixed(2);
      return {
        slice: s,
        d:
          `M${f(Tx0)},${f(Ty0)} L${f(Ax)},${f(Ay)} A${cr},${cr} 0 0 1 ${f(Bx)},${f(By)} ` +
          `A${radius},${radius} 0 0 1 ${f(Cx)},${f(Cy)} A${cr},${cr} 0 0 1 ${f(Dx)},${f(Dy)} ` +
          `L${f(Tx1)},${f(Ty1)} A${tipR},${tipR} 0 0 1 ${f(Tx0)},${f(Ty0)} Z`,
        labelX: (center + (radius + 25) * Math.cos(aMid)) / view * 100,
        labelY: (center + (radius + 25) * Math.sin(aMid)) / view * 100,
      };
    });
  }

  function sliceTitle(s) {
    const g = s.grade === "gray" ? "unknown" : s.grade;
    let state;
    if (s.partial) state = `tentative ${g} (${s.modelsCount}/3 models submitted)`;
    else if (s.tentative) state = `tentative ${g}`;
    else state = g;
    const head = s.shortHeadline ? ` — ${s.shortHeadline}` : "";
    return `${s.label}: ${state}${head}`;
  }

  /**
   * Render the pizza wheel.
   * opts: { size: number (px), labels: bool, stroke: string }
   */
  function renderPizza(slices, opts) {
    opts = opts || {};
    const size = opts.size || 36;
    const labels = !!opts.labels;
    const view = 360;
    const radius = 140;
    const cr = 12;
    const tipR = 8;
    const stroke = opts.stroke || "#0b0e14";
    const strokeW = labels ? 6 : 10;
    const paths = pizzaPaths(slices, view, radius, cr, tipR);
    const hatchId = nextId();

    const defs = svgEl("defs", null, [
      (function () {
        const p = svgEl("pattern", {
          id: hatchId,
          patternUnits: "userSpaceOnUse",
          width: 14,
          height: 14,
          patternTransform: "rotate(135)",
        });
        p.appendChild(svgEl("rect", { width: 14, height: 14, fill: "rgba(0,0,0,0)" }));
        p.appendChild(
          svgEl("line", { x1: 0, y1: 0, x2: 0, y2: 14, stroke: "rgba(255,255,255,0.35)", "stroke-width": 5 }),
        );
        return p;
      })(),
    ]);

    const wedges = paths.map((p) => {
      const path = svgEl("path", {
        d: p.d,
        fill: GRADE_FILL[p.slice.grade] || GRADE_FILL.gray,
        stroke: stroke,
        "stroke-width": strokeW,
        "stroke-linejoin": "round",
      });
      path.appendChild(svgEl("title", null, [document.createTextNode(sliceTitle(p.slice))]));
      return path;
    });
    const hatches = paths
      .filter((p) => p.slice.partial || p.slice.tentative)
      .map((p) => svgEl("path", { d: p.d, fill: `url(#${hatchId})`, stroke: "none", "pointer-events": "none" }));

    const svg = svgEl(
      "svg",
      {
        viewBox: `0 0 ${view} ${view}`,
        width: size,
        height: size,
        role: "img",
        "aria-label": "DeFiPunkd risk pizza",
        class: "dpk-pizza-svg",
      },
      [defs].concat(wedges).concat(hatches),
    );

    if (!labels) return svg;

    // labelled wrapper (for the large panel)
    const wrap = htmlEl("div", { class: "dpk-pizza-labeled" });
    wrap.appendChild(svg);
    for (const p of paths) {
      const lab = htmlEl("span", { class: "dpk-pizza-label", text: SHORT_LABEL[p.slice.id] || p.slice.label });
      lab.style.left = p.labelX + "%";
      lab.style.top = p.labelY + "%";
      wrap.appendChild(lab);
    }
    return wrap;
  }

  // ---- tier medal (TierMedal.svelte) ----
  function starPath(cx, cy, outer, inner) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const ang = -Math.PI / 2 + (i * Math.PI) / 5;
      pts.push(`${(cx + r * Math.cos(ang)).toFixed(2)},${(cy + r * Math.sin(ang)).toFixed(2)}`);
    }
    return `M${pts.join(" L")} Z`;
  }

  function renderTierMedal(tier, size) {
    const s = size || 16;
    const cx = s / 2;
    const r = s / 2 - 0.5;
    const showGlyph = s >= MEDAL_CHECK_MIN;
    const common = { width: s, height: s, viewBox: `0 0 ${s} ${s}`, role: "img", class: "dpk-medal" };

    if (tier === "none" || !TIER_STOPS[tier]) {
      const svg = svgEl("svg", Object.assign({ "aria-label": "No submissions yet" }, common), [
        svgEl("title", null, [document.createTextNode("No submissions yet")]),
        svgEl("circle", {
          cx, cy: cx, r, fill: "none", stroke: "#2a2f3a", "stroke-width": 1, "stroke-dasharray": "2 2",
        }),
      ]);
      if (showGlyph) {
        const arm = s * 0.22, w = Math.max(1, s * 0.1);
        svg.appendChild(svgEl("line", { x1: cx - arm, y1: cx, x2: cx + arm, y2: cx, stroke: "#8b93a1", "stroke-width": w, "stroke-linecap": "round" }));
        svg.appendChild(svgEl("line", { x1: cx, y1: cx - arm, x2: cx, y2: cx + arm, stroke: "#8b93a1", "stroke-width": w, "stroke-linecap": "round" }));
      }
      return svg;
    }

    const gradId = nextId();
    const grad = svgEl("linearGradient", { id: gradId, x1: "0%", y1: "0%", x2: "100%", y2: "100%" });
    for (const [offset, color] of TIER_STOPS[tier]) grad.appendChild(svgEl("stop", { offset, "stop-color": color }));

    const svg = svgEl("svg", Object.assign({ "aria-label": TIER_LABEL[tier] }, common), [
      svgEl("defs", null, [grad]),
      svgEl("title", null, [document.createTextNode(TIER_LABEL[tier])]),
      svgEl("circle", { cx, cy: cx, r, fill: `url(#${gradId})`, stroke: TIER_RIM[tier], "stroke-width": 1 }),
    ]);
    const glyph = TIER_CHECK[tier];
    if (showGlyph) {
      if (tier === "wood") {
        const arm = s * 0.26, w = Math.max(1.4, s * 0.13);
        svg.appendChild(svgEl("line", { x1: cx - arm, y1: cx, x2: cx + arm, y2: cx, stroke: glyph, "stroke-width": w, "stroke-linecap": "round" }));
        svg.appendChild(svgEl("line", { x1: cx, y1: cx - arm, x2: cx, y2: cx + arm, stroke: glyph, "stroke-width": w, "stroke-linecap": "round" }));
      } else if (tier === "bronze") {
        const dr = Math.max(0.9, s * 0.08), gap = s * 0.22;
        svg.appendChild(svgEl("circle", { cx: cx - gap, cy: s / 2, r: dr, fill: glyph }));
        svg.appendChild(svgEl("circle", { cx, cy: s / 2, r: dr, fill: glyph }));
        svg.appendChild(svgEl("circle", { cx: cx + gap, cy: s / 2, r: dr, fill: glyph }));
      } else if (tier === "silver") {
        const w = Math.max(1.5, s * 0.14), pad = s * 0.28;
        svg.appendChild(svgEl("path", {
          d: `M${pad} ${s * 0.52} L${s * 0.44} ${s - pad * 0.8} L${s - pad} ${s * 0.34}`,
          fill: "none", stroke: glyph, "stroke-width": w, "stroke-linecap": "round", "stroke-linejoin": "round",
        }));
      } else if (tier === "gold") {
        svg.appendChild(svgEl("path", { d: starPath(cx, cx, s * 0.32, s * 0.14), fill: glyph }));
      }
    }
    return svg;
  }

  // ---- streamlined risk matrix (compact analog of RiskMatrix.astro) ----
  function gradeChip(grade, uncertain) {
    const label = grade === "gray" ? "unknown" : grade;
    return htmlEl("span", {
      class: "dpk-chip" + (uncertain ? " dpk-chip-uncertain" : ""),
      text: label,
      style: `--c:${GRADE_CHIP[grade] || GRADE_CHIP.gray}`,
    });
  }

  function renderRiskMatrix(slices) {
    const table = htmlEl("div", { class: "dpk-matrix" });
    for (const s of slices) {
      const row = htmlEl("div", { class: "dpk-matrix-row" }, [
        htmlEl("span", { class: "dpk-matrix-label", text: s.label }),
        gradeChip(s.grade, s.partial || s.tentative),
        htmlEl("span", { class: "dpk-matrix-head", text: s.shortHeadline || "" }),
      ]);
      table.appendChild(row);
    }
    return table;
  }

  // ---- pills (control criteria) ----
  function host(url) {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
  }
  function renderPills(record) {
    const p = record.pills || {};
    const wrap = htmlEl("div", { class: "dpk-pills" });
    const upLabel = { immutable: "Immutable", upgradeable: "Upgradeable", mixed: "Mixed", unknown: "Unknown" };
    const add = (name, valNode) => {
      const pill = htmlEl("span", { class: "dpk-pill" }, [htmlEl("span", { class: "dpk-pill-k", text: name }), valNode]);
      wrap.appendChild(pill);
    };
    add("Upgradeability", p.upgradeability
      ? htmlEl("span", { class: `dpk-pill-v dpk-up-${p.upgradeability}`, text: upLabel[p.upgradeability] || p.upgradeability })
      : htmlEl("span", { class: "dpk-pill-dash", text: "—" }));
    const link = (url) => htmlEl("a", { class: "dpk-pill-link", href: url, target: "_blank", rel: "noreferrer", text: host(url) });
    add("Bug bounty", p.bugBountyUrl ? link(p.bugBountyUrl) : htmlEl("span", { class: "dpk-pill-dash", text: "—" }));
    add("Governance", p.governanceForum ? link(p.governanceForum) : htmlEl("span", { class: "dpk-pill-dash", text: "—" }));
    add("Docs", p.docsUrl ? link(p.docsUrl) : htmlEl("span", { class: "dpk-pill-dash", text: "—" }));
    return wrap;
  }

  // ---- full panel (ProtocolSummary hero, simplified) ----
  function defipunkdUrl(slug) { return `https://defipunkd.com/protocol/${slug}`; }

  function renderPanel(record, slug) {
    const panel = htmlEl("div", { class: "dpk-panel" });

    const header = htmlEl("div", { class: "dpk-panel-head" }, [
      htmlEl("span", { class: "dpk-brand", text: "DeFiPunk'd" }),
      renderTierMedal(record.tier, 20),
      htmlEl("span", { class: "dpk-tier-name", text: record.tier === "none" ? "Not yet assessed" : record.tier }),
      htmlEl("a", { class: "dpk-link", href: defipunkdUrl(slug), target: "_blank", rel: "noreferrer", text: "Full assessment ↗" }),
    ]);
    panel.appendChild(header);

    const body = htmlEl("div", { class: "dpk-panel-body" }, [
      htmlEl("div", { class: "dpk-panel-pizza" }, [renderPizza(record.slices, { size: 220, labels: true, stroke: "#0d1119" })]),
      htmlEl("div", { class: "dpk-panel-right" }, [renderRiskMatrix(record.slices)]),
    ]);
    panel.appendChild(body);

    if (record.about) {
      panel.appendChild(htmlEl("div", { class: "dpk-about" }, [
        htmlEl("div", { class: "dpk-k", text: "About (DeFiPunk'd)" }),
        htmlEl("p", { class: "dpk-about-text", text: record.about }),
      ]));
    }
    panel.appendChild(renderPills(record));
    return panel;
  }

  // ---- streamlined block (for the "Protocol Information" card) ----
  // For a family parent (record.family with >1 entry) renders a tab per child
  // and swaps the pizza + matrix on click; otherwise a single assessment.
  function renderStreamlined(record, slug) {
    const block = htmlEl("div", { class: "dpk-streamlined" });

    const entries =
      record.family && record.family.length > 1
        ? record.family.map((f) => ({ slug: f.slug, name: f.name, tier: f.tier, slices: f.slices }))
        : [{ slug, name: record.name, tier: record.tier, slices: record.slices }];

    const medalWrap = htmlEl("span", { class: "dpk-medal-wrap" });
    const tierName = htmlEl("span", { class: "dpk-tier-name" });
    const link = htmlEl("a", {
      class: "dpk-link",
      target: "_blank",
      rel: "noreferrer",
      text: "View on DeFiPunk'd ↗",
    });
    block.appendChild(
      htmlEl("div", { class: "dpk-stream-head" }, [
        htmlEl("div", { class: "dpk-stream-meta" }, [
          htmlEl("div", { class: "dpk-stream-title" }, [
            htmlEl("span", { class: "dpk-brand", text: "Risk Assessment by DeFiPunk'd" }),
            medalWrap,
            tierName,
          ]),
          link,
        ]),
      ]),
    );

    let tabBar = null;
    if (entries.length > 1) {
      tabBar = htmlEl("div", { class: "dpk-tabs" });
      entries.forEach((e, i) => {
        const b = htmlEl("button", { class: "dpk-tab", type: "button", text: e.name });
        b.addEventListener("click", () => setActive(i));
        tabBar.appendChild(b);
      });
      block.appendChild(tabBar);
    }

    const content = htmlEl("div", { class: "dpk-stream-content" });
    block.appendChild(content);

    function setActive(i) {
      const e = entries[i];
      medalWrap.textContent = "";
      medalWrap.appendChild(renderTierMedal(e.tier, 16));
      tierName.textContent = e.tier === "none" ? "Not yet assessed" : e.tier;
      link.setAttribute("href", defipunkdUrl(e.slug));
      content.textContent = "";
      content.appendChild(
        htmlEl("div", { class: "dpk-stream-row" }, [renderPizza(e.slices, { size: 90 }), renderRiskMatrix(e.slices)]),
      );
      if (tabBar) {
        const kids = tabBar.children;
        for (let k = 0; k < kids.length; k++) {
          if (kids[k].classList) kids[k].classList.toggle("dpk-tab-active", k === i);
        }
      }
    }

    setActive(0);
    return block;
  }

  // ---- small badge (table cell + protocol header) ----
  // A <span> (not <a>) so it can sit inline inside DeFiLlama's name <a> without
  // nesting anchors; clicking opens the DeFiPunk'd assessment.
  function renderBadge(record, slug, size) {
    const span = htmlEl("span", {
      class: "dpk-badge",
      role: "link",
      tabindex: "0",
      title: `DeFiPunk'd — ${TIER_LABEL[record.tier] || "not yet assessed"}`,
    });
    span.appendChild(renderPizza(record.slices, { size: size || 22 }));
    span.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.open(defipunkdUrl(slug), "_blank", "noopener");
    });
    return span;
  }

  globalThis.DPK = {
    SLICE_ORDER,
    GRADE_FILL,
    renderPizza,
    renderTierMedal,
    renderRiskMatrix,
    renderPanel,
    renderStreamlined,
    renderBadge,
    defipunkdUrl,
  };
})();
