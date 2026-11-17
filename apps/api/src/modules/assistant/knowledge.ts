import {
  COD_LIMIT,
  DELIVERY_FEE,
  FREE_DELIVERY_ABOVE,
  NEW_ACCOUNT_COD_LIMIT,
  formatINR,
} from "@lofticore/shared";

// What the assistant knows about the shop. Plain data on purpose: easy to read,
// easy to correct, and the numbers come from the same constants the shop uses, so
// the answers can't drift away from what actually happens.

export interface Topic {
  id: string;
  // phrases that point to this topic; longer phrases count for more
  keywords: string[];
  answer: string;
  links?: { label: string; to: string }[];
  suggestions?: string[];
}

export const topics: Topic[] = [
  {
    id: "delivery",
    keywords: [
      "delivery",
      "delivery charge",
      "delivery fee",
      "shipping",
      "free delivery",
      "how long",
      "delivery time",
      "deliver to",
      "when will it arrive",
      "delivery cost",
    ],
    answer: `Delivery is free on orders of ${formatINR(FREE_DELIVERY_ABOVE)} and above, and ${formatINR(DELIVERY_FEE)} below that. Each seller packs their own parcel, and a delivery partner brings it to your door. You'll get a notification at every step.`,
    suggestions: ["Track my order", "What is the delivery code?"],
  },
  {
    id: "delivery_code",
    keywords: [
      "delivery code",
      "4 digit code",
      "otp at door",
      "code to delivery partner",
      "verification code door",
    ],
    answer:
      "When your parcel is shipped, a 4-digit delivery code appears on your order page. Tell it to the delivery partner only when the parcel is in your hands. It proves you received it, so please don't share it earlier.",
    links: [{ label: "My orders", to: "/orders" }],
  },
  {
    id: "payment",
    keywords: [
      "payment",
      "pay",
      "upi",
      "cash on delivery",
      "cod",
      "gpay",
      "phonepe",
      "paytm",
      "how do i pay",
      "payment methods",
      "payment options",
    ],
    answer: `You can pay with UPI or cash on delivery. UPI orders are confirmed the moment the payment goes through, and we hold your items for 15 minutes while you pay. Cash on delivery is available up to ${formatINR(COD_LIMIT)} (${formatINR(NEW_ACCOUNT_COD_LIMIT)} for accounts under 3 days old that haven't received an order yet).`,
    suggestions: ["My payment failed", "Can I cancel an order?"],
  },
  {
    id: "payment_failed",
    keywords: [
      "payment failed",
      "payment did not go through",
      "money deducted",
      "charged but",
      "payment pending",
      "payment stuck",
      "upi failed",
    ],
    answer:
      "If a UPI payment fails, nothing is charged and your items stay held for a few minutes, so you can open the order and tap 'Try again'. If money ever leaves your account for an order that doesn't go through, it's refunded automatically.",
    links: [{ label: "My orders", to: "/orders" }],
  },
  {
    id: "cancel",
    keywords: [
      "cancel",
      "cancel order",
      "cancel my order",
      "change my mind",
      "refund",
      "money back",
    ],
    answer:
      "You can cancel an order from its page until the seller has packed it. Paid orders are refunded to you automatically. Once a parcel is packed or shipped it can't be cancelled, but you can report a problem or return it after it arrives.",
    links: [{ label: "My orders", to: "/orders" }],
  },
  {
    id: "returns",
    keywords: [
      "return",
      "returns",
      "replace",
      "replacement",
      "exchange",
      "damaged",
      "broken",
      "wrong item",
      "not as described",
      "defective",
    ],
    answer:
      "Sorry about that. Open the order and choose 'Something wrong with this order?' to tell us what happened. Our team reviews every report and follows up with you. You have 7 days from delivery to raise it.",
    links: [{ label: "My orders", to: "/orders" }],
  },
  {
    id: "fraud",
    keywords: [
      "scam",
      "fraud",
      "fake",
      "counterfeit",
      "report",
      "suspicious",
      "cheated",
      "complaint",
    ],
    answer:
      "Thank you for flagging it. You can report any product, order or review with the 'Report' links on its page. Our team checks every report and can pull a listing or suspend a seller. You'll get a notification with the outcome.",
  },
  {
    id: "account",
    keywords: [
      "forgot password",
      "reset password",
      "can't log in",
      "cannot login",
      "change password",
      "locked out",
      "sign in problem",
    ],
    answer:
      "No problem. Use 'Forgot password?' on the sign-in page and we'll email you a reset link that's valid for 30 minutes. After a reset, you're signed out of every device for your safety.",
    links: [{ label: "Reset my password", to: "/forgot-password" }],
  },
  {
    id: "seller",
    keywords: [
      "sell",
      "become a seller",
      "seller account",
      "list my products",
      "sell furniture",
      "vendor",
      "open a shop",
    ],
    answer:
      "Welcome aboard! Create a seller account, then send us your business details (PAN, address, payout UPI). Our team verifies every seller to keep customers safe, and we email you as soon as you're approved. After that you can list products, and each new product is checked before it goes live.",
    links: [{ label: "Become a seller", to: "/register?role=seller" }],
  },
  {
    id: "delivery_partner",
    keywords: [
      "deliver for you",
      "delivery partner",
      "become a delivery",
      "drive for",
      "rider",
      "work as a delivery",
    ],
    answer:
      "You can sign up as a delivery partner, then add your licence and the pincodes you cover. Our team verifies you, and once approved you'll see the parcels assigned to you.",
    links: [{ label: "Deliver with us", to: "/register?role=delivery" }],
  },
  {
    id: "ar",
    keywords: [
      "ar",
      "augmented reality",
      "see it in my room",
      "view in my room",
      "3d",
      "how big",
      "will it fit",
      "size in my space",
      "try in my room",
    ],
    answer:
      "Products with the 'View in AR' badge have a 3D model. Open the product and tap 'View in your room' on your phone to place it in your space at its real size. On a computer you can still spin it around in 3D. Each product page also lists exact width, depth and height.",
    suggestions: ["Show me sofas", "Show me lamps"],
  },
  {
    id: "wishlist",
    keywords: ["wishlist", "save for later", "favourite", "favorite", "heart"],
    answer:
      "Tap the heart on any product to save it to your wishlist. You'll find everything you've saved in your account menu under Wishlist.",
    links: [{ label: "My wishlist", to: "/wishlist" }],
  },
  {
    id: "reviews",
    keywords: ["review", "rate", "rating", "feedback", "stars"],
    answer:
      "Once a product has been delivered to you, you'll see 'Write a review' on its page. Reviews are only for people who bought and received the item, so you can trust the ones you read.",
  },
  {
    id: "stock",
    keywords: ["out of stock", "sold out", "restock", "back in stock", "available"],
    answer:
      "Sold-out items can't be ordered right now. Save the product to your wishlist and check back, as sellers restock regularly. Pages show 'Only a few left' when stock is low.",
  },
  {
    id: "addresses",
    keywords: ["address", "change address", "add address", "pincode", "where do you deliver"],
    answer:
      "You can save several addresses and pick one at checkout. Add or edit them any time under Addresses in your account menu.",
    links: [{ label: "My addresses", to: "/account/addresses" }],
  },
  {
    id: "tour",
    keywords: [
      "tour",
      "show me around",
      "how does this work",
      "how to use",
      "guide me",
      "help me get started",
      "walkthrough",
      "what can i do here",
    ],
    answer: "Happy to show you around! I'll point out the main parts of the shop.",
    suggestions: ["How do I pay?", "Show me sofas"],
  },
];

export const greetings = [
  "hi",
  "hello",
  "hey",
  "good morning",
  "good evening",
  "namaste",
  "hii",
  "yo",
];
export const thanks = ["thanks", "thank you", "thx", "great", "perfect", "awesome"];

export const starterSuggestions = [
  "Show me sofas",
  "How do I pay?",
  "Track my order",
  "Show me around",
];
