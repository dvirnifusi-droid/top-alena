import { test, expect } from "@playwright/test";

test("home loads with hero and reservation CTA", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toContainText("חמארה");
  await expect(page.getByRole("link", { name: /הזמן שולחן/ }).first()).toBeVisible();
});

test("home has Restaurant JSON-LD", async ({ page }) => {
  await page.goto("/");
  const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
  expect(ld).toContain("Restaurant");
});

test("html is RTL Hebrew", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "he");
});

test("sitemap exists with primary routes", async ({ request }) => {
  const r = await request.get("/sitemap.xml");
  expect(r.status()).toBe(200);
  const xml = await r.text();
  expect(xml).toContain("/תפריט");
  expect(xml).toContain("/בלוג");
});

test("robots.txt exists", async ({ request }) => {
  const r = await request.get("/robots.txt");
  expect(r.status()).toBe(200);
  expect(await r.text()).toContain("Sitemap");
});
