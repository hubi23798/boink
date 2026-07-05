import { expect, test } from "@playwright/test";

test("unauthenticated home redirects to /login", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.status()).toBeLessThan(400);
  await expect(page).toHaveURL(/\/login(\?from=)?/);
  await expect(page.getByText(/sign in to truffe\.ai/i)).toBeVisible();
});

test("login page renders passkey + magic link form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText(/sign in to truffe\.ai/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in with passkey/i })).toBeVisible();
  await expect(page.getByLabel(/email/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /send magic link/i })).toBeVisible();
});

// Requires authenticated storageState (E2E_WITH_AUTH=1). Skipped in default CI until auth fixture lands.
test("primary tenant data renders on /", async ({ page }) => {
  test.skip(!process.env.E2E_WITH_AUTH, "Set E2E_WITH_AUTH=1 with authenticated storageState");

  await page.goto("/");
  await expect(page.getByTestId("net-worth-hero")).toBeVisible();
  await expect(page).not.toHaveURL(/\/tenants/);
});
