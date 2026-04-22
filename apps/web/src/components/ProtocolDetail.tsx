import type { JSX } from "react";
import type { Protocol, ProvenanceTag } from "@defibeat/registry";
import { auditorDomain, EM_DASH, formatTvl, formatUtc, parseHallmarks } from "../lib/format";
import { verifiabilityGrade } from "../lib/verifiability";
import { dependenciesGrade } from "../lib/dependencies";
import { PizzaChart } from "./PizzaChart";

type RowProps = {
  label: string;
  anchor?: string;
  value: string | JSX.Element;
  provenance: ProvenanceTag | null;
};

function ProvenanceTagEl({ tag }: { tag: ProvenanceTag | null }): JSX.Element {
  if (!tag) return <span style={{ color: "#475569" }}>{EM_DASH}</span>;
  return <span style={{ color: "#64748b", fontSize: "0.8em" }}>[{tag}]</span>;
}

function Row({ label, anchor, value, provenance }: RowProps): JSX.Element {
  return (
    <tr id={anchor}>
      <th
        scope="row"
        style={{
          textAlign: "left",
          padding: "0.6rem 1rem",
          borderBottom: "1px solid #1e293b",
          color: "#94a3b8",
          fontWeight: 500,
          width: "18rem",
          verticalAlign: "top",
        }}
      >
        {label}
      </th>
      <td style={{ padding: "0.6rem 1rem", borderBottom: "1px solid #1e293b", color: "#e2e8f0" }}>
        {value}
      </td>
      <td
        style={{
          padding: "0.6rem 1rem",
          borderBottom: "1px solid #1e293b",
          width: "8rem",
          textAlign: "right",
        }}
      >
        <ProvenanceTagEl tag={provenance} />
      </td>
    </tr>
  );
}

function unknownCell(): JSX.Element {
  return <span style={{ color: "#475569" }}>unknown</span>;
}

type ChainTabsProps = {
  chains: string[];
  tvlByChain: Record<string, number>;
  activeChain: string;
};

function ChainTabs({ chains, tvlByChain, activeChain }: ChainTabsProps): JSX.Element {
  const ranked = [...chains].sort((a, b) => (tvlByChain[b] ?? 0) - (tvlByChain[a] ?? 0));
  const visible = ranked.slice(0, 7);
  const overflow = ranked.slice(7);
  return (
    <nav style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", marginBottom: "1rem" }}>
      {visible.map((c) => {
        const active = c === activeChain;
        return (
          <a
            key={c}
            href={`?chain=${encodeURIComponent(c)}`}
            style={{
              padding: "0.35rem 0.75rem",
              borderRadius: 4,
              background: active ? "#22d3ee" : "#1e293b",
              color: active ? "#0f172a" : "#cbd5e1",
              textDecoration: "none",
              fontSize: "0.85rem",
            }}
          >
            {c}
            {typeof tvlByChain[c] === "number" ? (
              <span style={{ marginLeft: 6, opacity: 0.7 }}>{formatTvl(tvlByChain[c]!)}</span>
            ) : null}
          </a>
        );
      })}
      {overflow.length > 0 ? (
        <details>
          <summary style={{ padding: "0.35rem 0.75rem", background: "#1e293b", borderRadius: 4, cursor: "pointer", color: "#cbd5e1", fontSize: "0.85rem" }}>
            +{overflow.length} more
          </summary>
          <div style={{ display: "flex", flexDirection: "column", marginTop: "0.25rem", gap: "0.15rem" }}>
            {overflow.map((c) => (
              <a
                key={c}
                href={`?chain=${encodeURIComponent(c)}`}
                style={{ color: "#cbd5e1", fontSize: "0.85rem", textDecoration: "none" }}
              >
                {c}
              </a>
            ))}
          </div>
        </details>
      ) : null}
    </nav>
  );
}

function HallmarksTimeline({ raw }: { raw: unknown }): JSX.Element {
  const marks = parseHallmarks(raw);
  if (marks.length === 0) return unknownCell();
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {marks.map((h) => (
        <li key={`${h.unixTs}-${h.description}`} style={{ padding: "0.2rem 0", color: "#cbd5e1" }}>
          <span style={{ color: "#64748b", marginRight: 8 }}>
            {formatUtc(new Date(h.unixTs * 1000).toISOString())}
          </span>
          {h.description}
        </li>
      ))}
    </ul>
  );
}

function AuditsRow({ count, links }: { count: number; links: string[] }): JSX.Element {
  if (count === 0 && links.length === 0) return unknownCell();
  return (
    <details>
      <summary style={{ cursor: "pointer" }}>
        {count} audit{count === 1 ? "" : "s"}
      </summary>
      <ul style={{ listStyle: "none", padding: "0.5rem 0 0 0", margin: 0 }}>
        {links.map((l) => {
          const d = auditorDomain(l);
          return (
            <li key={l} style={{ padding: "0.15rem 0" }}>
              <a href={l} style={{ color: "#22d3ee" }} rel="noreferrer" target="_blank">
                {d ?? l}
              </a>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function ChildrenTable({
  children,
}: {
  children: Protocol[];
}): JSX.Element | null {
  if (children.length === 0) return null;
  const rows = [...children].sort((a, b) => (b.tvl ?? -1) - (a.tvl ?? -1));
  return (
    <section style={{ marginTop: "2rem" }}>
      <h2 style={{ color: "#e2e8f0", borderBottom: "1px solid #1e293b", paddingBottom: "0.5rem" }}>
        Family members
      </h2>
      <table style={{ width: "100%", borderCollapse: "collapse", color: "#cbd5e1" }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#64748b", fontSize: "0.85rem" }}>
            <th style={{ padding: "0.4rem 0.6rem" }}>#</th>
            <th style={{ padding: "0.4rem 0.6rem" }}>Name</th>
            <th style={{ padding: "0.4rem 0.6rem" }}>Chain</th>
            <th style={{ padding: "0.4rem 0.6rem" }}>Risks</th>
            <th style={{ padding: "0.4rem 0.6rem" }}>Stage</th>
            <th style={{ padding: "0.4rem 0.6rem" }}>Type</th>
            <th style={{ padding: "0.4rem 0.6rem", textAlign: "right" }}>TVL</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => (
            <tr key={c.slug} style={{ borderTop: "1px solid #1e293b" }}>
              <td style={{ padding: "0.4rem 0.6rem", color: "#64748b" }}>{i + 1}</td>
              <td style={{ padding: "0.4rem 0.6rem" }}>
                <a href={`/protocol/${c.slug}`} style={{ color: "#22d3ee" }}>
                  {c.name}
                </a>
              </td>
              <td style={{ padding: "0.4rem 0.6rem" }}>{(c.chains[0] ?? EM_DASH)}</td>
              <td style={{ padding: "0.4rem 0.6rem" }}>
                <PizzaChart
                  size="sm"
                  grades={{
                    verifiability: verifiabilityGrade(
                      !!(c.github && c.github.length > 0),
                      c.audit_count ?? 0,
                    ),
                    dependencies: dependenciesGrade(c.category, c.forked_from),
                  }}
                />
              </td>
              <td style={{ padding: "0.4rem 0.6rem", color: "#475569" }}>{EM_DASH}</td>
              <td style={{ padding: "0.4rem 0.6rem" }}>{c.category || EM_DASH}</td>
              <td style={{ padding: "0.4rem 0.6rem", textAlign: "right" }}>{formatTvl(c.tvl)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Link({ href }: { href: string | null }): JSX.Element {
  if (!href) return unknownCell();
  return (
    <a href={href} style={{ color: "#22d3ee" }} rel="noreferrer" target="_blank">
      {href}
    </a>
  );
}

export type ProtocolDetailProps = {
  protocol: Protocol;
  snapshotGeneratedAt: string;
  children: Protocol[];
  activeChain: string;
};

export function ProtocolDetail({
  protocol,
  snapshotGeneratedAt,
  children,
  activeChain,
}: ProtocolDetailProps): JSX.Element {
  const prov = protocol._provenance;
  return (
    <main
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: "2rem 1.5rem",
        color: "#e2e8f0",
      }}
    >
      <header style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ margin: 0, color: "#e2e8f0", fontSize: "1.75rem" }}>{protocol.name}</h1>
          <p style={{ color: "#64748b", margin: "0.25rem 0 0 0" }}>
            {protocol.category || EM_DASH}
            {protocol.parent_slug ? (
              <>
                {" · child of "}
                <a href={`/protocol/${protocol.parent_slug}`} style={{ color: "#22d3ee" }}>
                  {protocol.parent_slug}
                </a>
              </>
            ) : null}
          </p>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <PizzaChart
            size="lg"
            grades={{
              verifiability: verifiabilityGrade(
                !!(protocol.github && protocol.github.length > 0),
                protocol.audit_count ?? 0,
              ),
              dependencies: dependenciesGrade(protocol.category, protocol.forked_from),
            }}
          />
        </div>
      </header>

      <section style={{ marginTop: "1.5rem" }}>
        {protocol.chains.length > 0 ? (
          <ChainTabs
            chains={protocol.chains}
            tvlByChain={protocol.tvl_by_chain}
            activeChain={activeChain}
          />
        ) : null}
      </section>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "0.95rem",
          marginTop: "0.5rem",
        }}
      >
        <tbody>
          <Row
            label="TVL"
            value={formatTvl(protocol.tvl)}
            provenance={prov.tvl ?? null}
          />
          <Row
            label="Chains"
            value={protocol.chains.length > 0 ? protocol.chains.join(", ") : unknownCell()}
            provenance={prov.chains ?? null}
          />
          <Row
            label="Website"
            value={<Link href={protocol.website} />}
            provenance={prov.website ?? null}
          />
          <Row
            label="Twitter"
            value={
              protocol.twitter ? (
                <a
                  href={`https://twitter.com/${protocol.twitter}`}
                  style={{ color: "#22d3ee" }}
                  rel="noreferrer"
                  target="_blank"
                >
                  @{protocol.twitter}
                </a>
              ) : (
                unknownCell()
              )
            }
            provenance={prov.twitter ?? null}
          />
          <Row
            label="GitHub"
            anchor="verifiability"
            value={
              protocol.github && protocol.github.length > 0 ? (
                <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {protocol.github.map((g) => (
                    <li key={g}>
                      <a
                        href={g}
                        style={{ color: "#22d3ee" }}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {g}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                unknownCell()
              )
            }
            provenance={prov.github ?? null}
          />
          <Row
            label="Audits"
            anchor="verifiability"
            value={<AuditsRow count={protocol.audit_count} links={protocol.audit_links} />}
            provenance={prov.audit_links ?? prov.audit_count ?? null}
          />
          <Row label="Control" anchor="control" value={unknownCell()} provenance={null} />
          <Row label="Ability to exit" anchor="ability-to-exit" value={unknownCell()} provenance={null} />
          <Row label="Dependencies" anchor="dependencies" value={unknownCell()} provenance={null} />
          <Row label="Access" anchor="access" value={unknownCell()} provenance={null} />
          <Row label="Verifiability" anchor="verifiability" value={unknownCell()} provenance={null} />
          <Row
            label="Review status"
            value={<span style={{ color: "#94a3b8" }}>listed</span>}
            provenance={"defillama"}
          />
          <Row
            label="Hallmarks"
            value={<HallmarksTimeline raw={protocol.hallmarks} />}
            provenance={prov.hallmarks ?? null}
          />
          <Row
            label="Updated"
            value={formatUtc(snapshotGeneratedAt)}
            provenance={"defillama"}
          />
        </tbody>
      </table>

      <ChildrenTable children={children} />

      <footer style={{ marginTop: "3rem", color: "#475569", fontSize: "0.85rem" }}>
        <a href="/" style={{ color: "#22d3ee" }}>
          ← back to index
        </a>
      </footer>
    </main>
  );
}

export function DelistedDetail({
  protocol,
}: {
  protocol: Protocol;
}): JSX.Element {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "4rem 1.5rem",
        color: "#e2e8f0",
      }}
    >
      <h1 style={{ color: "#e2e8f0" }}>{protocol.name}</h1>
      <p style={{ color: "#f87171" }}>
        This protocol has been delisted from DeFiLlama as of {formatUtc(protocol.delisted_at)}.
      </p>
      <p style={{ color: "#94a3b8" }}>
        DefiBeat mirrors DeFiLlama. See the{" "}
        <a
          href={`https://defillama.com/protocol/${protocol.slug}`}
          style={{ color: "#22d3ee" }}
          rel="noreferrer"
          target="_blank"
        >
          DeFiLlama page
        </a>{" "}
        for the last known data.
      </p>
      <p>
        <a href="/" style={{ color: "#22d3ee" }}>
          ← back to index
        </a>
      </p>
    </main>
  );
}
