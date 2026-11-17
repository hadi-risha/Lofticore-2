import { OrderStatus, productQuerySchema, type ChatReply } from "@lofticore/shared";
import { listProducts } from "../catalog/catalog.service";
import { Order } from "../orders/order.model";
import { greetings, starterSuggestions, thanks, topics, type Topic } from "./knowledge";
import { askModel, type Turn } from "./llm";

const ORDER_LABEL: Record<OrderStatus, string> = {
  pending_payment: "awaiting payment",
  placed: "booked",
  processing: "being prepared",
  shipped: "on the way",
  delivered: "received",
  cancelled: "cancelled",
};

const normalise = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// the last word may be plural: "charge" matches "charges"
const has = (text: string, phrase: string) =>
  new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:s|es)?\\b`).test(text);

// How well a message matches a topic: longer matching phrases count for more.
function score(topic: Topic, text: string) {
  return topic.keywords.reduce(
    (n, k) => (has(text, k) ? n + k.split(" ").length + (k.length > 6 ? 1 : 0) : n),
    0,
  );
}

function bestTopic(text: string) {
  let best: { topic: Topic; score: number } | null = null;
  for (const topic of topics) {
    const s = score(topic, text);
    if (s > 0 && (!best || s > best.score)) best = { topic, score: s };
  }
  return best;
}

const FILLER = new Set([
  "show",
  "me",
  "find",
  "looking",
  "for",
  "search",
  "do",
  "you",
  "have",
  "any",
  "a",
  "an",
  "some",
  "the",
  "i",
  "want",
  "need",
  "to",
  "buy",
  "recommend",
  "suggest",
  "please",
  "can",
  "get",
  "see",
  "some",
  "something",
  "like",
  "is",
  "there",
  "are",
  "what",
  "about",
  "your",
]);
const SEARCH_VERB =
  /\b(show|find|looking for|search|do you have|recommend|suggest|want|need|buy|got any|any)\b/;

const searchTerm = (text: string) =>
  text
    .split(" ")
    .filter((w) => w && !FILLER.has(w))
    .join(" ");

async function productReply(term: string): Promise<ChatReply | null> {
  if (term.length < 3) return null;
  const { items } = await listProducts(productQuerySchema.parse({ q: term, limit: 4 }));
  if (items.length === 0) return null;
  return {
    reply: `Here ${items.length === 1 ? "is one" : "are a few"} that might suit you:`,
    products: items,
    links: [{ label: `See all results for "${term}"`, to: `/shop?q=${encodeURIComponent(term)}` }],
    suggestions: ["Show me around", "How do I pay?"],
    source: "search",
  };
}

async function trackReply(userId: string | undefined): Promise<ChatReply> {
  if (!userId) {
    return {
      reply: "I can look up your orders once you're signed in.",
      links: [{ label: "Sign in", to: "/login" }],
      source: "rules",
    };
  }
  const orders = await Order.find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(3)
    .select("orderNumber status");
  if (orders.length === 0) {
    return {
      reply: "You haven't placed any orders yet. When you do, you can follow them right here.",
      links: [{ label: "Start shopping", to: "/shop" }],
      source: "rules",
    };
  }
  return {
    reply: `Here are your latest orders:\n${orders.map((o) => `• ${o.orderNumber} is ${ORDER_LABEL[o.status]}`).join("\n")}`,
    links: [
      { label: `Open ${orders[0]!.orderNumber}`, to: `/orders/${orders[0]!._id}` },
      { label: "All my orders", to: "/orders" },
    ],
    source: "rules",
  };
}

export async function answer(
  message: string,
  history: Turn[],
  userId?: string,
): Promise<ChatReply> {
  const text = normalise(message);
  const words = text.split(" ");

  if (words.length <= 3 && greetings.some((g) => text === g || text.startsWith(`${g} `))) {
    return {
      reply:
        "Hello! I'm Lofti. I can help you find furniture, check an order, or answer questions about delivery and payment. What would you like to do?",
      suggestions: starterSuggestions,
      source: "rules",
    };
  }
  if (words.length <= 4 && thanks.some((t) => has(text, t))) {
    return {
      reply: "You're welcome! Anything else I can help with?",
      suggestions: starterSuggestions,
      source: "rules",
    };
  }

  // asking where something is. ("cancel my order" mentions an order too, but isn't a tracking question.)
  if (
    /\b(track|where is|where's|status of|has my|when will my)\b.*\b(order|parcel|package|delivery)\b/.test(
      text,
    )
  ) {
    return trackReply(userId);
  }

  const topic = bestTopic(text);
  // a clear match on the guide wins, unless they're plainly asking for products
  if (topic && (topic.score >= 2 || !SEARCH_VERB.test(text))) {
    return {
      reply: topic.topic.answer,
      links: topic.topic.links,
      suggestions: topic.topic.suggestions,
      action: topic.topic.id === "tour" ? "start_tour" : undefined,
      source: "rules",
    };
  }

  // just "my orders"
  if (/^(my )?orders?$/.test(text)) return trackReply(userId);

  // looks like a product request, or an unknown phrase that might still be a product
  const found = await productReply(searchTerm(text));
  if (found) return found;

  if (topic) {
    return {
      reply: topic.topic.answer,
      links: topic.topic.links,
      suggestions: topic.topic.suggestions,
      source: "rules",
    };
  }

  const ai = await askModel(message, history);
  if (ai) return { reply: ai, suggestions: starterSuggestions, source: "ai" };

  return {
    reply:
      "I'm not sure I understood that. I can help you find products, track an order, or explain delivery, payments, returns and selling. Try one of these:",
    suggestions: starterSuggestions,
    source: "rules",
  };
}
