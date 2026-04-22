export type Slug = string;

export type ProtocolSnapshot = {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl: number | null;
  tvl_by_chain: Record<string, number>;
  website: string | null;
  twitter: string | null;
  github: string[] | null;
  audit_count: number;
  audit_links: string[];
  hallmarks: Array<[number, string]>;
  parent_slug: string | null;
  is_dead: boolean;
  is_parent: boolean;
  first_seen_at: string;
  last_seen_at: string;
  delisted_at: string | null;
};

export type Snapshot = {
  generated_at: string;
  protocols: Record<Slug, ProtocolSnapshot>;
};

export type ProvenanceTag = "defillama" | "curated" | "defillama-parent";

export type Protocol = ProtocolSnapshot & {
  _provenance: Partial<Record<keyof ProtocolSnapshot, ProvenanceTag>>;
};
