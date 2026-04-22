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
import { ProtocolLogo } from "./ProtocolLogo";
import { EM_DASH, formatTvl } from "../lib/format";
import { pizzaGradesFor } from "../lib/pizza";

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
              aria-pressed={active}
              onClick={() => {
                setTab(t);
                setShowAll(false);
              }}
              style={{
                minHeight: 44,
                padding: "0 0.9rem",
                border: "none",
                borderRadius: 4,
                background: active ? "var(--accent-link)" : "var(--surface-raised)",
                color: active ? "var(--bg)" : "var(--text)",
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
          aria-label="Search protocols by name, slug, or category"
          placeholder="Search name, slug, category"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            flex: "1 1 18rem",
            minHeight: 44,
            padding: "0 0.75rem",
            background: "var(--bg)",
            color: "var(--text)",
            border: "1px solid var(--surface-raised)",
            borderRadius: 4,
            fontSize: "0.9rem",
          }}
        />
        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
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
              aria-pressed={on}
              onClick={() => setPizzaFilters((prev) => ({ ...prev, [s.id]: !prev[s.id] }))}
              title={`${s.label} ${EM_DASH} all unknown at Phase 0`}
              style={{
                minHeight: 44,
                padding: "0 0.9rem",
                border: "1px solid var(--surface-raised)",
                borderRadius: 999,
                background: on ? "var(--accent-link)" : "transparent",
                color: on ? "var(--bg)" : "var(--text-muted)",
                fontSize: "0.75rem",
                cursor: "pointer",
              }}
            >
              {s.label}
            </button>
          );
        })}
        {activePizzas.length > 0 ? (
          <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", alignSelf: "center", marginLeft: "0.5rem" }}>
            (filters are no-ops at Phase 0)
          </span>
        ) : null}
      </div>

      <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", color: "var(--text)", fontSize: "0.9rem" }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--text-muted)", fontSize: "0.8rem" }}>
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
      </div>

      <div style={{ marginTop: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
          Showing {visible.length.toLocaleString()} of {filtered.length.toLocaleString()}
        </span>
        {filtered.length > DEFAULT_PAGE ? (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            style={{
              background: "transparent",
              border: "1px solid var(--surface-raised)",
              color: "var(--accent-link)",
              minHeight: 44,
              padding: "0 0.9rem",
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
    <th style={{ padding: 0, textAlign: align }}>
      <button
        type="button"
        onClick={() => active && onClick(field)}
        disabled={!active}
        aria-sort={isActive ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
        style={{
          background: "transparent",
          border: "none",
          padding: "0.45rem 0.6rem",
          minHeight: 44,
          width: "100%",
          textAlign: align,
          color: isActive ? "var(--text)" : "var(--text-muted)",
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
        borderTop: "1px solid var(--surface-raised)",
        background: isChild ? "var(--surface)" : undefined,
      }}
    >
      <td style={{ padding: "0.45rem 0.6rem", color: "var(--text-muted)" }}>{rank ?? ""}</td>
      <td style={{ padding: "0.45rem 0.6rem", paddingLeft: isChild ? "2rem" : "0.6rem" }}>
        {isFamilyHead ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? "Collapse family" : "Expand family"}
            style={{
              boxSizing: "border-box",
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              marginRight: 6,
              padding: "0.6rem",
              minWidth: 44,
              minHeight: 44,
              fontSize: "0.85rem",
              textAlign: "center",
              verticalAlign: "middle",
            }}
          >
            {isExpanded ? "\u25BE" : "\u25B8"}
          </button>
        ) : !isChild ? (
          <span
            aria-hidden
            style={{ display: "inline-block", width: 44, marginRight: 6, verticalAlign: "middle" }}
          />
        ) : null}
        <ProtocolLogo slug={row.slug} name={row.name} size={20} />
        <a href={`/protocol/${row.slug}`} style={{ textDecoration: "none", marginLeft: 8 }}>
          {row.name}
        </a>
        {isFamilyHead ? (
          <span style={{ color: "var(--text-muted)", marginLeft: 6, fontSize: "0.75rem" }}>
            ({row.children?.length ?? 0})
          </span>
        ) : null}
        {row.is_dead ? (
          <span style={{ color: "var(--text-muted)", marginLeft: 6, fontSize: "0.75rem" }}>(inactive)</span>
        ) : null}
      </td>
      <td style={{ padding: "0.45rem 0.6rem" }}>
        {row.primary_chain ?? EM_DASH}
        {extraChains > 0 ? (
          <span
            style={{
              marginLeft: 6,
              padding: "0 0.4rem",
              background: "var(--surface-raised)",
              borderRadius: 999,
              color: "var(--text-muted)",
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
          grades={pizzaGradesFor(row.category, row.verifiability_grade, row.dependencies_grade)}
        />
      </td>
      <td style={{ padding: "0.45rem 0.6rem", color: "var(--text-muted)" }}>{EM_DASH}</td>
      <td style={{ padding: "0.45rem 0.6rem" }}>{row.category || EM_DASH}</td>
      <td style={{ padding: "0.45rem 0.6rem", textAlign: "right", fontFamily: "var(--font-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums" }}>{formatTvl(row.tvl)}</td>
    </tr>
  );
}
