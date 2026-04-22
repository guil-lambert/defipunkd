export type LlamaProtocol = {
  id?: string;
  name: string;
  slug: string;
  category?: string | null;
  chains?: string[];
  url?: string | null;
  twitter?: string | null;
  github?: string[] | null;
  audits?: string | number | null;
  audit_links?: string[] | null;
  hallmarks?: Array<[number, string]> | null;
  parentProtocol?: string | null;
  deadUrl?: string | null;
  deadFrom?: number | string | null;
  tvl?: number | null;
  chainTvls?: Record<string, number | null> | null;
};

export type LlamaParentProtocol = {
  id: string;
  name: string;
  url?: string | null;
  description?: string | null;
  logo?: string | null;
  chains?: string[] | null;
  twitter?: string | null;
  github?: string[] | null;
  symbol?: string | null;
};

export function parentSlugFromId(id: string): string {
  return id.startsWith("parent#") ? id.slice("parent#".length) : id;
}
