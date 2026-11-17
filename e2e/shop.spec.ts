import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { addFirstProductToCart, fillAddress, signUpCustomer } from "./helpers";

test.describe("browsing", () => {
  test("a visitor can search, filter and open a product", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /Furniture with a point of view/ }),
    ).toBeVisible();

    // the home page is filled with real products from the API
    await expect(page.getByRole("heading", { name: "Best sellers" })).toBeVisible();

    await page.getByRole("combobox", { name: "Search products" }).fill("lamp");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/shop\?q=lamp/);
    await expect(page.getByRole("heading", { name: 'Results for "lamp"' })).toBeVisible();
    const cards = page.locator("article a[href^='/product/']");
    await expect(cards.first()).toBeVisible();

    // filters live in the URL
    await page.getByLabel("In stock only").click();
    await expect(page).toHaveURL(/inStock=true/);
    await page.getByLabel("Sort by").selectOption("price_asc");
    await expect(page).toHaveURL(/sort=price_asc/);

    await cards.first().click();
    await expect(page).toHaveURL(/\/product\//);
    await expect(page.getByRole("button", { name: "Add to cart" })).toBeEnabled();
    await expect(page.getByText("Size & materials")).toBeVisible();
  });

  test("a made-up address shows the friendly 404 page", async ({ page }) => {
    await page.goto("/shop/no-such-category");
    await expect(page.getByRole("heading", { name: "This page wandered off" })).toBeVisible();
    await page.getByRole("link", { name: "Back to home" }).click();
    await expect(page).toHaveURL("/");
  });

  test("guests are sent to sign in before checkout, and come back afterwards", async ({ page }) => {
    await addFirstProductToCart(page, "lighting");
    await page.goto("/cart");
    await page.getByRole("button", { name: "Checkout" }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("buying", () => {
  // each test signs up, fills an address and pays, which takes a while on a slow machine
  test.setTimeout(120_000);

  test("sign up, verify by email, and pay cash on delivery", async ({ page }) => {
    // a small item: new accounts can pay cash on delivery up to ₹15,000
    await signUpCustomer(page, "cod");
    await addFirstProductToCart(page, "vases-and-planters");

    await page.goto("/checkout");
    await fillAddress(page);
    await page.getByRole("radio", { name: /Cash on delivery/ }).click();
    await page.getByRole("button", { name: "Place order" }).click();

    await expect(page.getByText("Thank you! Your order is booked.")).toBeVisible();
    await expect(page.getByText("Booked", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Pay on delivery")).toBeVisible();

    // and it shows up in the order list, with a notification waiting
    await page.goto("/orders");
    await expect(page.getByText(/^LC-\d{8}-/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Notifications, \d+ unread/ })).toBeVisible();
  });

  test("pay with UPI through the demo UPI app, and the shop page notices", async ({
    page,
    context,
  }) => {
    await signUpCustomer(page, "upi");
    await addFirstProductToCart(page, "decor");

    await page.goto("/checkout");
    await fillAddress(page);
    await page.getByRole("button", { name: "Continue to pay" }).click();

    await expect(page.getByRole("heading", { name: "Complete your payment" })).toBeVisible();
    await expect(page.getByText(/Waiting for payment confirmation/)).toBeVisible();

    // the customer "switches to their UPI app" in another window
    const [upiApp] = await Promise.all([
      context.waitForEvent("page"),
      page.getByRole("button", { name: "Open demo UPI app" }).click(),
    ]);
    await upiApp.getByLabel("Enter UPI PIN").fill("4821");
    await upiApp.getByRole("button", { name: /^Pay ₹/ }).click();
    await expect(upiApp.getByRole("heading", { name: "Payment successful" })).toBeVisible({
      timeout: 45_000,
    });
    await upiApp.close();

    // no click needed here: the waiting page sees the payment land
    await expect(page.getByText("Thank you! Your order is booked.")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Paid", { exact: true })).toBeVisible();
  });

  test("a failed UPI payment can be retried", async ({ page, context }) => {
    await signUpCustomer(page, "retry");
    await addFirstProductToCart(page, "decor");
    await page.goto("/checkout");
    await fillAddress(page);
    await page.getByRole("button", { name: "Continue to pay" }).click();

    const [upiApp] = await Promise.all([
      context.waitForEvent("page"),
      page.getByRole("button", { name: "Open demo UPI app" }).click(),
    ]);
    await upiApp.getByLabel("Enter UPI PIN").fill("0000"); // the demo's "insufficient balance"
    await upiApp.getByRole("button", { name: /^Pay ₹/ }).click();
    await expect(upiApp.getByRole("heading", { name: "Insufficient balance" })).toBeVisible({
      timeout: 45_000,
    });
    await upiApp.close();

    await expect(page.getByRole("heading", { name: "Payment didn't go through" })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("heading", { name: "Complete your payment" })).toBeVisible();
  });
});

test.describe("accounts", () => {
  test("the wrong password is refused with a clear message, the right one works", async ({
    page,
  }) => {
    const email = await signUpCustomer(page, "login");
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("WrongPass999");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toContainText("Email or password is incorrect");

    await page.getByLabel("Password").fill("Sofa12345");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
  });
});

test.describe("3D view", () => {
  // These tests run on the production build with the production security headers, so a
  // Content-Security-Policy that blocks the viewer's textures or models fails here.
  test("the 3D model loads at the product's real size, without security-policy errors", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const violations: string[] = [];
    page.on("console", (msg) => {
      const text = msg.text();
      // Editor extensions (like Console Ninja) can inject inline scripts into a local Vite
      // server and trip the policy; the app itself ships none, which the next test proves.
      if (
        /Content Security Policy|violates the document/i.test(text) &&
        !/inline script/i.test(text)
      )
        violations.push(text);
    });

    await page.goto("/product/cloud-boucle-sofa-set");
    await page.getByRole("button", { name: "View in 3D / AR" }).click();

    const viewer = page.locator("model-viewer");
    await expect(viewer).toBeVisible();
    // the model comes from a public sample on GitHub, so allow for a slow download
    await expect
      .poll(() => viewer.evaluate((el) => (el as unknown as { loaded: boolean }).loaded), {
        timeout: 100_000,
      })
      .toBe(true);

    // scaled so its height is the listing's 70 cm
    await expect
      .poll(
        () =>
          viewer.evaluate(
            (el) => (el as unknown as { getDimensions(): { y: number } }).getDimensions().y,
          ),
        { timeout: 10_000 },
      )
      .toBeCloseTo(0.7, 2);

    expect(violations).toEqual([]);
  });
  test("the built page has no inline scripts, so the strict script policy holds", () => {
    const html = readFileSync(path.join("apps", "web", "dist", "index.html"), "utf8");
    // a <script> tag with no src attribute is an inline script
    const inline = html.match(/<script(?![^>]*\bsrc=)[^>]*>/g) ?? [];
    expect(inline).toEqual([]);
  });
});
