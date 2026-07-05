import { expect, test } from "@playwright/test";

/**
 * Phase A acceptance checks that run without authenticated fixtures.
 * See docs/superpowers/plans/2026-06-27-phase-a-tenancy-supabase.md Task 22.
 */
test.describe("Phase A acceptance (unauthenticated)", () => {
  test("proxy enforces auth on protected routes", async ({ page }) => {
    await page.goto("/transactions");
    await expect(page).toHaveURL(/\/login/);
  });

  test("public trust page is reachable", async ({ page }) => {
    await page.goto("/trust", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /built to be verified/i })).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("tenant picker requires auth", async ({ page }) => {
    await page.goto("/tenants");
    await expect(page).toHaveURL(/\/login/);
  });

  test("health endpoint returns ok", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { ok?: boolean };
    expect(body.ok).toBe(true);
  });
});
