import { expect, test } from "@playwright/test";

test("on a phone, the menu opens and the product grid fits the screen", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  const menu = page.getByRole("dialog", { name: "Menu" });
  await expect(menu).toBeVisible();
  await menu.getByRole("link", { name: "Sofas & Seating" }).click();

  await expect(page.getByRole("heading", { name: "Sofas & Seating" })).toBeVisible();
  await expect(page.locator("article").first()).toBeVisible();

  // nothing should push the page wider than the phone
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
