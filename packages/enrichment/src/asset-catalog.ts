import { load } from "cheerio";
import { AssetComparisonSchema, CatalogAssetSchema } from "@defipunkd/registry";

/** Parse only the documented crawlable catalog. Never infer token scope from issuer totals. */
export function parseAssetDirectory(html: string) {
  const $ = load(html);
  const assets = $("main li a[href^='/assets/']").map((_, el) => {
    const a = $(el);
    const match = a.text().trim().match(/^(.+?) — (.+)$/);
    if (!match) throw new Error("Unrecognized asset directory label");
    return CatalogAssetSchema.parse({ id: a.attr("href")!.slice(8), symbol: match[1], name: match[2], kind: a.parent().find("span").text().trim() });
  }).get();
  const count = $("main").text().match(/(\d+) assets in this covered-market subset/);
  if (!count || assets.length !== Number(count[1]) || new Set(assets.map((a) => a.id)).size !== assets.length) throw new Error("Incomplete asset directory");
  return assets;
}

export function parseAssetComparison(html: string, assetId: string) {
  const $ = load(html);
  const graphs = $("script[type='application/ld+json']").toArray().flatMap((el) => {
    const value = JSON.parse($(el).text());
    return value["@graph"] ?? [value];
  });
  const page = graphs.find((v) => v["@type"] === "WebPage" && v.url === `https://tokenizedstonks.io/assets/${assetId}`);
  if (!page) throw new Error("Wrong asset page");
  const table = $("main table").filter((_, el) => $(el).find("thead th").map((_, th) => $(th).text().trim()).get().join("|") === "Issuer|Token|Network|Contract|Form|Status");
  if (table.length !== 1) throw new Error("Missing or changed token table");
  const representations = table.find("tbody tr").map((_, tr) => {
    const cells = $(tr).children("td,th");
    if (cells.length !== 6) throw new Error("Malformed token row");
    const text = (n: number) => cells.eq(n).text().trim();
    const address = cells.eq(3).find("code").text().trim();
    return { issuer: text(0), symbol: text(1), network: text(2), contract: address || null, explorer_url: cells.eq(3).find("a").attr("href") ?? null, form: text(4) };
  }).get();
  const facts = $("main table").filter((_, el) => $(el).find("th").first().text() === "Security");
  const tokenFact = facts.find("tr").filter((_, el) => $(el).find("th").text() === "Tokens").find("td").text();
  const count = tokenFact.match(/^(\d+) tokens/);
  if (!count || Number(count[1]) !== representations.length) throw new Error("Incomplete token coverage");
  const keys = representations.map((r) => JSON.stringify([r.issuer, r.symbol, r.network, r.contract, r.form]));
  if (new Set(keys).size !== keys.length) throw new Error("Duplicate token representation");
  return AssetComparisonSchema.parse({ asset_id: assetId, as_of: page.dateModified, representations });
}
