import { expect, type Page } from "@playwright/test";

const MAILPIT = "http://localhost:8025";
export const PASSWORD = "Sofa12345";

// The latest 6-digit code Lofticore emailed to this address (Mailpit catches all mail).
export async function otpFor(email: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    const data = (await res.json()) as { messages?: { Subject: string }[] };
    const code = data.messages?.map((m) => /^(\d{6}) is your/.exec(m.Subject)?.[1]).find(Boolean);
    if (code) return code;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No verification email arrived for ${email}`);
}

// The first-sign-in tour darkens the page; close it so tests can click things.
export async function dismissTour(page: Page) {
  const popover = page.locator(".driver-popover");
  // the tour appears a moment after sign-in, so wait for it rather than checking once
  const appeared = await popover.waitFor({ state: "visible", timeout: 5_000 }).then(
    () => true,
    () => false,
  );
  if (appeared) {
    await page.keyboard.press("Escape");
    await expect(popover).toBeHidden();
  }
}

// Registers a brand-new customer through the real sign-up screens and lands signed in.
export async function signUpCustomer(page: Page, label = "shopper") {
  const email = `${label}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`;
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Test Shopper");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await page.getByLabel("Verification code").fill(await otpFor(email));

  // the sixth digit submits by itself
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
  await dismissTour(page);
  return email;
}

// Opens the first product in the given category and adds it to the cart.
export async function addFirstProductToCart(page: Page, categorySlug: string) {
  await page.goto(`/shop/${categorySlug}`);
  await page.locator("article a[href^='/product/']").first().click();
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByRole("link", { name: /Cart, 1 item/ })).toBeVisible();
}

export async function fillAddress(page: Page) {
  await page.getByLabel("Full name").fill("Test Shopper");
  await page.getByLabel("Mobile number").fill("9876543210");
  await page.getByLabel("House / flat and street").fill("14 Lake View Road, Flat 3B");
  await page.getByLabel("Pincode").fill("682001");
  await page.getByLabel("City").fill("Kochi");
  await page.getByLabel("State").fill("Kerala");
  await page.getByRole("button", { name: "Save address" }).click();
  await expect(page.getByText("Address saved.")).toBeVisible();
}
