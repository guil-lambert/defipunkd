import { expect, test } from "@playwright/test";

const KNOWN_SLUG = process.env.SMOKE_SLUG ?? "uniswap-v2";

test("landing page shows the DefiBeat title and category tabs", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: /defibeat/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /^All/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Lending/ })).toBeVisible();
});

test("a known protocol detail page renders the dense table and is noindex", async ({ page }) => {
  const res = await page.goto(`/protocol/${KNOWN_SLUG}`);
  expect(res?.status()).toBe(200);
  const robots = await page.locator('meta[name="robots"]').getAttribute("content");
  expect(robots ?? "").toMatch(/noindex/);
  await expect(page.getByRole("row", { name: /TVL/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Website/ })).toBeVisible();
});

test("methodology is indexable (no noindex)", async ({ page }) => {
  const res = await page.goto("/methodology");
  expect(res?.status()).toBe(200);
  const robots = await page.locator('meta[name="robots"]').count();
  if (robots > 0) {
    const content = await page.locator('meta[name="robots"]').first().getAttribute("content");
    expect(content ?? "").not.toMatch(/noindex/);
  }
  await expect(page.getByRole("heading", { level: 1, name: /methodology/i })).toBeVisible();
});

test("a delisted slug returns HTTP 410", async ({ request }) => {
  const slug = process.env.DELISTED_SMOKE_SLUG;
  test.skip(!slug, "no delisted slug in snapshot; set DELISTED_SMOKE_SLUG to enable");
  const res = await request.get(`/protocol/${slug}`);
  expect(res.status()).toBe(410);
  const body = await res.text();
  expect(body).toMatch(/delisted/i);
});
