"use client";

import { useMemo, useState, Fragment } from "react";
import {
  filterAndSortNodes,
  type LandingNode,
  type LandingRow,
  type SortDir,
  type SortField,
} from "../lib/landing";
import { DEFAULT_TAB, TABS, type Tab } from "../lib/category-map";
import { PIZZA_SLICES, PizzaChart } from "./PizzaChart";
import { EM_DASH, formatTvl } from "../lib/format";

const DEFAULT_PAGE = 200;

type Props = {
  nodes: LandingNode[];
  tabCounts: Record<Tab, number>;
};

export function LandingTable({ nodes, tabCounts }: Props) {
  const [tab, setTab] = useState<Tab>(DEFAULT_TAB);
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [pizzaFilters, setPizzaFilters] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [sortField, setSortField] = useState<SortField>("tvl");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const searching = query.trim().length > 0;
  const filtered = useMemo(
    () =>
      filterAndSortNodes(nodes, {
        tab,
        query,
        showInactive,
        sort: { field: sortField, dir: sortDir },
      }),
    [nodes, tab, query, showInactive, sortField, sortDir],
  );

  function onSortClick(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "tvl" ? "desc" : "asc");
    }
  }

  const visible = showAll ? filtered : filtered.slice(0, DEFAULT_PAGE);
  const activePizzas = Object.keys(pizzaFilters).filter((k) => pizzaFilters[k]);
  const showSort = !searching;

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
              {t} <span style={{ opacity: 0.6, marginLeft: 4 }}>{count.toLocaleString()}</span>
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
              onClick={() => setPizzaFilters((prev) => ({ ...prev, [s.id]: !prev[s.id] }))}
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
            <SortableHeader
              label="Name"
              field="name"
              sortField={sortField}
              sortDir={sortDir}
              onClick={onSortClick}
              active={showSort}
            />
            <SortableHeader
              label="Chain"
              field="chain"
              sortField={sortField}
              sortDir={sortDir}
              onClick={onSortClick}
              active={showSort}
            />
            <th style={{ padding: "0.45rem 0.6rem" }}>Risks</th>
            <th style={{ padding: "0.45rem 0.6rem" }}>Stage</th>
            <SortableHeader
              label="Type"
              field="type"
              sortField={sortField}
              sortDir={sortDir}
              onClick={onSortClick}
              active={showSort}
            />
            <SortableHeader
              label="TVL"
              field="tvl"
              sortField={sortField}
              sortDir={sortDir}
              onClick={onSortClick}
              active={showSort}
              align="right"
            />
          </tr>
        </thead>
        <tbody>
          {visible.map((node, i) => {
            const isFamily = !!(node.children && node.children.length > 0);
            const isExpanded = !!expanded[node.slug];
            return (
              <Fragment key={node.slug}>
                <Row
                  rank={i + 1}
                  row={node}
                  isFamilyHead={isFamily}
                  isExpanded={isExpanded}
                  onToggle={() =>
                    setExpanded((prev) => ({ ...prev, [node.slug]: !prev[node.slug] }))
                  }
                />
                {isFamily && isExpanded
                  ? (node.children ?? []).map((child) => (
                      <Row key={child.slug} rank={null} row={child} isChild />
                    ))
                  : null}
              </Fragment>
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
    </section>
  );
}

type SortableHeaderProps = {
  label: string;
  field: SortField;
  sortField: SortField;
  sortDir: SortDir;
  onClick: (field: SortField) => void;
  active: boolean;
  align?: "left" | "right";
};

function SortableHeader({ label, field, sortField, sortDir, onClick, active, align = "left" }: SortableHeaderProps) {
  const isActive = active && sortField === field;
  const arrow = isActive ? (sortDir === "asc" ? "\u2191" : "\u2193") : "\u2195";
  return (
    <th style={{ padding: "0.45rem 0.6rem", textAlign: align }}>
      <button
        type="button"
        onClick={() => active && onClick(field)}
        disabled={!active}
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          color: isActive ? "#cbd5e1" : "#64748b",
          cursor: active ? "pointer" : "default",
          fontSize: "0.8rem",
          fontWeight: 500,
          opacity: active ? 1 : 0.5,
        }}
      >
        {label}
        <span style={{ marginLeft: 4, opacity: isActive ? 1 : 0.4 }}>{arrow}</span>
      </button>
    </th>
  );
}

type RowProps = {
  rank: number | null;
  row: LandingNode;
  isFamilyHead?: boolean;
  isExpanded?: boolean;
  onToggle?: () => void;
  isChild?: boolean;
};

function Row({ rank, row, isFamilyHead, isExpanded, onToggle, isChild }: RowProps) {
  const extraChains = Math.max(0, row.chains.length - 1);
  return (
    <tr
      style={{
        borderTop: "1px solid #1e293b",
        background: isChild ? "rgba(34,211,238,0.04)" : undefined,
      }}
    >
      <td style={{ padding: "0.45rem 0.6rem", color: "#64748b" }}>{rank ?? ""}</td>
      <td style={{ padding: "0.45rem 0.6rem", paddingLeft: isChild ? "2rem" : "0.6rem" }}>
        {isFamilyHead ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isExpanded}
            style={{
              background: "transparent",
              border: "none",
              color: "#64748b",
              cursor: "pointer",
              marginRight: 6,
              padding: 0,
              fontSize: "0.85rem",
              width: "1rem",
              textAlign: "center",
            }}
          >
            {isExpanded ? "\u25BE" : "\u25B8"}
          </button>
        ) : null}
        <a href={`/protocol/${row.slug}`} style={{ color: "#22d3ee", textDecoration: "none" }}>
          {row.name}
        </a>
        {isFamilyHead ? (
          <span style={{ color: "#64748b", marginLeft: 6, fontSize: "0.75rem" }}>
            ({row.children?.length ?? 0})
          </span>
        ) : null}
        {row.is_dead ? (
          <span style={{ color: "#f87171", marginLeft: 6, fontSize: "0.75rem" }}>(inactive)</span>
        ) : null}
      </td>
      <td style={{ padding: "0.45rem 0.6rem" }}>
        {row.primary_chain ?? EM_DASH}
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
        <PizzaChart
          size="sm"
          grades={{
            verifiability: row.verifiability_grade,
            dependencies: row.dependencies_grade,
          }}
        />
      </td>
      <td style={{ padding: "0.45rem 0.6rem", color: "#475569" }}>{EM_DASH}</td>
      <td style={{ padding: "0.45rem 0.6rem" }}>{row.category || EM_DASH}</td>
      <td style={{ padding: "0.45rem 0.6rem", textAlign: "right" }}>{formatTvl(row.tvl)}</td>
    </tr>
  );
}
