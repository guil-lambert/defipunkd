import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { notFound } from "next/navigation";
import { getProtocol, listChildren, listProtocols, type Snapshot } from "@defibeat/registry";
import { DelistedDetail, ProtocolDetail } from "../../../components/ProtocolDetail";
import { primaryChain } from "../../../lib/format";

export const dynamic = "force-static";
export const dynamicParams = false;

export const metadata = {
  robots: { index: false, follow: false },
};

export function generateStaticParams(): Array<{ slug: string }> {
  return listProtocols().map((p) => ({ slug: p.slug }));
}

function findSnapshotPath(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, "data", "defillama-snapshot.json");
    try {
      readFileSync(candidate, "utf8");
      return candidate;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  throw new Error("snapshot not found");
}

let cachedGeneratedAt: string | null = null;
function snapshotGeneratedAt(): string {
  if (cachedGeneratedAt) return cachedGeneratedAt;
  const raw = readFileSync(findSnapshotPath(), "utf8");
  const snap = JSON.parse(raw) as Snapshot;
  cachedGeneratedAt = snap.generated_at;
  return cachedGeneratedAt;
}

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ProtocolPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const protocol = getProtocol(slug);
  if (!protocol) notFound();

  if (protocol.delisted_at) {
    return <DelistedDetail protocol={protocol} />;
  }

  const qs = await searchParams;
  const chainParam = typeof qs.chain === "string" ? qs.chain : null;
  const active =
    chainParam && protocol.chains.includes(chainParam)
      ? chainParam
      : primaryChain(protocol.tvl_by_chain) ?? protocol.chains[0] ?? "";

  return (
    <ProtocolDetail
      protocol={protocol}
      snapshotGeneratedAt={snapshotGeneratedAt()}
      children={listChildren(slug)}
      activeChain={active}
    />
  );
}
