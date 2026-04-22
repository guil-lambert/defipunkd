"use client";

import { useMemo, useState } from "react";
import { filterAndSort, type LandingRow } from "../lib/landing";
import { TABS, type Tab } from "../lib/category-map";
import { PIZZA_SLICES, PizzaChart } from "./PizzaChart";
import { EM_DASH, formatTvl } from "../lib/format";

const DEFAULT_PAGE = 200;

type Props = {
  rows: LandingRow[];
  tabCounts: Record<Tab, number>;
};

export function LandingTable({ rows, tabCounts }: Props) {
  const [tab, setTab] = useState<Tab>("All");
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [pizzaFilters, setPizzaFilters] = useState<Record<string, boolean>>({});

  const filtered = useMemo(
    () => filterAndSort(rows, { tab, query, showInactive }),
    [rows, tab, query, showInactive],
  );

  const visible = showAll ? filtered : filtered.slice(0, DEFAULT_PAGE);
  const activePizzas = Object.keys(pizzaFilters).filter((k) => pizzaFilters[k]);

  return (
    <section>
      <nav style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        {TABS.map((t) => {
          const active = t === tab;
          const count = tabCounts[t] ?? 0;
          return (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t);
                setShowAll(false);
              }}
              style={{
                padding: "0.4rem 0.85rem",
                border: "none",
                borderRadius: 4,
                background: active ? "#22d3ee" : "#1e293b",
                color: active ? "#0f172a" : "#cbd5e1",
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
            >
              {t}{" "}
              <span style={{ opacity: 0.6, marginLeft: 4 }}>{count.toLocaleString()}</span>
            </button>
          );
        })}
      </nav>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.75rem", alignItems: "center" }}>
        <input
          type="search"
          placeholder="Search name, slug, category"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            flex: "1 1 18rem",
            padding: "0.5rem 0.75rem",
            background: "#0f172a",
            color: "#e2e8f0",
            border: "1px solid #1e293b",
            borderRadius: 4,
            outline: "none",
            fontSize: "0.9rem",
          }}
        />
        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", color: "#94a3b8", fontSize: "0.85rem" }}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>
      </div>

      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        {PIZZA_SLICES.map((s) => {
          const on = !!pizzaFilters[s.id];
          return (
            <button
              key={s.id}
              type="button"
              onClick={() =>
                setPizzaFilters((prev) => ({ ...prev, [s.id]: !prev[s.id] }))
              }
              title={`${s.label} ${EM_DASH} all unknown at Phase 0`}
              style={{
                padding: "0.25rem 0.6rem",
                border: "1px solid #1e293b",
                borderRadius: 999,
                background: on ? "#22d3ee" : "transparent",
                color: on ? "#0f172a" : "#64748b",
                fontSize: "0.75rem",
                cursor: "pointer",
              }}
            >
              {s.label}
            </button>
          );
        })}
        {activePizzas.length > 0 ? (
          <span style={{ color: "#64748b", fontSize: "0.75rem", alignSelf: "center", marginLeft: "0.5rem" }}>
            (filters are no-ops at Phase 0)
          </span>
        ) : null}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", color: "#cbd5e1", fontSize: "0.9rem" }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#64748b", fontSize: "0.8rem" }}>
            <th style={{ padding: "0.45rem 0.6rem", width: "3rem" }}>#</th>
            <th style={{ padding: "0.45rem 0.6rem" }}>Name</th>
            <th style={{ padding: "0.45rem 0.6rem" }}>Chain</th>
            <th style={{ padding: "0.45rem 0.6rem" }}>Risks</th>
            <th style={{ padding: "0.45rem 0.6rem" }}>Stage</th>
            <th style={{ padding: "0.45rem 0.6rem" }}>Type</th>
            <th style={{ padding: "0.45rem 0.6rem", textAlign: "right" }}>TVL</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((r, i) => {
            const extraChains = Math.max(0, r.chains.length - 1);
            return (
              <tr key={r.slug} style={{ borderTop: "1px solid #1e293b" }}>
                <td style={{ padding: "0.45rem 0.6rem", color: "#64748b" }}>{i + 1}</td>
                <td style={{ padding: "0.45rem 0.6rem" }}>
                  <a href={`/protocol/${r.slug}`} style={{ color: "#22d3ee", textDecoration: "none" }}>
                    {r.name}
                  </a>
                  {r.is_dead ? (
                    <span style={{ color: "#f87171", marginLeft: 6, fontSize: "0.75rem" }}>(inactive)</span>
                  ) : null}
                </td>
                <td style={{ padding: "0.45rem 0.6rem" }}>
                  {r.primary_chain ?? EM_DASH}
                  {extraChains > 0 ? (
                    <span
                      style={{
                        marginLeft: 6,
                        padding: "0 0.4rem",
                        background: "#1e293b",
                        borderRadius: 999,
                        color: "#64748b",
                        fontSize: "0.7rem",
                      }}
                    >
                      +{extraChains}
                    </span>
                  ) : null}
                </td>
                <td style={{ padding: "0.2rem 0.6rem" }}>
                  <PizzaChart size="sm" />
                </td>
                <td style={{ padding: "0.45rem 0.6rem", color: "#475569" }}>{EM_DASH}</td>
                <td style={{ padding: "0.45rem 0.6rem" }}>{r.category || EM_DASH}</td>
                <td style={{ padding: "0.45rem 0.6rem", textAlign: "right" }}>{formatTvl(r.tvl)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ marginTop: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#64748b", fontSize: "0.85rem" }}>
          Showing {visible.length.toLocaleString()} of {filtered.length.toLocaleString()}
        </span>
        {filtered.length > DEFAULT_PAGE ? (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            style={{
              background: "transparent",
              border: "1px solid #1e293b",
              color: "#22d3ee",
              padding: "0.4rem 0.85rem",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: "0.85rem",
            }}
          >
            {showAll ? "Collapse to top 200" : "Show all"}
          </button>
        ) : null}
      </div>

      <ReviewedGrid />
    </section>
  );
}

function ReviewedGrid() {
  return null;
}
