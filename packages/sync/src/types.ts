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
