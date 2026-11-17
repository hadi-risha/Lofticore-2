import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { Role } from "@lofticore/shared";

// Short, friendly walkthroughs - one per kind of account. Each step points at an
// element marked with data-tour="...". Steps whose element isn't on screen (like the
// desktop menu on a phone) are skipped, so the tour never points at nothing.

type Step = { target: string; title: string; text: string };

const common: Step[] = [
  {
    target: "bell",
    title: "Stay in the loop",
    text: "Orders, payments and account updates show up here, so you never have to wonder what's happening.",
  },
  {
    target: "chat",
    title: "Ask Lofti",
    text: "Not sure where something is? Ask about products, delivery, payments or your orders any time.",
  },
];

const TOURS: Record<"customer" | "seller" | "delivery" | "admin", Step[]> = {
  customer: [
    {
      target: "search",
      title: "Find anything",
      text: "Search by name, style or material. Suggestions appear as you type.",
    },
    {
      target: "nav",
      title: "Browse by room and style",
      text: "Furniture and decor are sorted into categories, and every list has filters for price, material and colour.",
    },
    {
      target: "cart",
      title: "Your cart",
      text: "Everything you add waits here. Delivery is free on orders of ₹10,000 and above.",
    },
    ...common,
    {
      target: "account",
      title: "Your account",
      text: "Find your orders, wishlist and saved addresses here. You can replay this tour from this menu any time.",
    },
  ],
  seller: [
    {
      target: "nav-seller",
      title: "Your studio",
      text: "Everything you need to run your shop is in this menu.",
    },
    {
      target: "nav-products",
      title: "Products",
      text: "Add products with photos, sizes and prices. Each new one is checked by our team before it goes live.",
    },
    {
      target: "nav-orders",
      title: "Orders",
      text: "Confirm, pack and hand over each parcel. Customers are updated at every step.",
    },
    {
      target: "nav-details",
      title: "Business details",
      text: "Keep your details up to date. Sellers are verified before they can sell.",
    },
    ...common,
    { target: "account", title: "Your account", text: "Sign out or replay this tour from here." },
  ],
  delivery: [
    {
      target: "nav-deliveries",
      title: "Your deliveries",
      text: "Parcels assigned to you appear here. Mark each one out for delivery, then enter the customer's 4-digit code at the door.",
    },
    {
      target: "nav-details",
      title: "Your details",
      text: "Update your vehicle, licence and the areas you cover.",
    },
    ...common,
    { target: "account", title: "Your account", text: "Sign out or replay this tour from here." },
  ],
  admin: [
    {
      target: "nav-overview",
      title: "Overview",
      text: "What needs your attention today: sellers to verify, products to review and open reports.",
    },
    {
      target: "nav-people",
      title: "People",
      text: "Approve sellers and delivery partners, or block someone and decide what happens to their open orders.",
    },
    {
      target: "nav-product",
      title: "Product review",
      text: "Check new products before they go live.",
    },
    {
      target: "nav-reports",
      title: "Reports",
      text: "Problems raised by customers, oldest first.",
    },
    ...common,
    { target: "account", title: "Your account", text: "Sign out or replay this tour from here." },
  ],
};

export const tourKind = (role: Role): keyof typeof TOURS =>
  role === Role.SELLER
    ? "seller"
    : role === Role.DELIVERY
      ? "delivery"
      : role === Role.ADMIN || role === Role.SUPER_ADMIN
        ? "admin"
        : "customer";

// Where each kind of tour should start, so the menu it points at is on screen.
export const tourHome = (role: Role) =>
  ({ customer: "/", seller: "/seller", delivery: "/delivery", admin: "/admin" })[tourKind(role)];

const visible = (selector: string) => {
  const el = document.querySelector<HTMLElement>(selector);
  return el && el.getClientRects().length > 0 ? el : null;
};

export function runTour(role: Role, onFinish: () => void) {
  const steps: DriveStep[] = TOURS[tourKind(role)]
    .filter((s) => visible(`[data-tour="${s.target}"]`))
    .map((s) => ({
      element: `[data-tour="${s.target}"]`,
      popover: { title: s.title, description: s.text },
    }));

  if (steps.length === 0) {
    onFinish();
    return;
  }

  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    onFinish();
  };

  const tour = driver({
    steps,
    showProgress: true,
    progressText: "{{current}} of {{total}}",
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Got it",
    allowClose: true,
    overlayOpacity: 0.55,
    stagePadding: 6,
    stageRadius: 14,
    popoverClass: "lofticore-tour",
    // closing early or finishing both count: the person has seen it
    onDestroyed: done,
  });
  tour.drive();
}
