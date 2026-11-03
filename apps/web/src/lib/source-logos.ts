export const SOURCE_LOGOS = {
  defillama: "/logos/defillama.ico",
  defiscan: "/logos/defiscan.ico",
  etherscan: "/logos/etherscan.ico",
  sourcify: "/logos/sourcify.ico",
  immunefi: "/logos/immunefi.png",
  cantina: "/logos/cantina.svg",
  github: "/logos/github.svg",
  tokenizedstonks: "/logos/tokenizedstonks.svg",
} as const;
export type SourceBrand = keyof typeof SOURCE_LOGOS;
const HOSTS: Record<string, SourceBrand> = {
  "defillama.com": "defillama", "defiscan.info": "defiscan",
  "etherscan.io": "etherscan", "sourcify.dev": "sourcify",
  "immunefi.com": "immunefi", "cantina.xyz": "cantina",
  "github.com": "github", "raw.githubusercontent.com": "github",
  "tokenizedstonks.io": "tokenizedstonks",
};
export function sourceBrandForUrl(href?: string | null): SourceBrand | undefined {
  if (!href) return undefined;
  try {
    const url = new URL(href);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return Object.entries(HOSTS).find(([host]) => url.hostname === host || url.hostname.endsWith(`.${host}`))?.[1];
  } catch { return undefined; }
}
