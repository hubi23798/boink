import { test, expect } from "@playwright/test";

test("unauthenticated /settings/connections redirects to /login", async ({ page }) => {
  await page.goto("/settings/connections");
  await expect(page).toHaveURL(/\/login/);
});
