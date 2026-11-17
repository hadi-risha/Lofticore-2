import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { topics } from "./knowledge";

// The language model is the fallback, not the first stop: the built-in guide answers
// the common questions instantly and for free. This only runs when a question isn't
// covered and GEMINI_API_KEY is set (Google's free tier works).

const SYSTEM = `You are Lofti, the shopping assistant for Lofticore, an Indian online furniture and home decor marketplace.
Answer briefly (2-4 sentences), in a warm and plain tone. Prices are in rupees.
Only talk about Lofticore and furniture/decor shopping. If you don't know something specific about an order or account, say so and suggest the Orders page or the 'Something wrong with this order?' option.
Never ask for passwords, card numbers, UPI PINs or OTPs, and tell people never to share them.
What you know about the shop:
${topics.map((t) => `- ${t.answer}`).join("\n")}`;

export interface Turn {
  role: "user" | "assistant";
  text: string;
}

export const llmEnabled = () => Boolean(env.GEMINI_API_KEY);

// Returns null on any problem, so the caller can fall back to a friendly default.
export async function askModel(message: string, history: Turn[]): Promise<string | null> {
  if (!env.GEMINI_API_KEY) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          // only the conversation text goes out: no names, emails, orders or ids
          contents: [...history, { role: "user", text: message }].map((t) => ({
            role: t.role === "assistant" ? "model" : "user",
            parts: [{ text: t.text }],
          })),
          generationConfig: { maxOutputTokens: 300, temperature: 0.4 },
        }),
      },
    );
    if (!res.ok) {
      logger.warn({ status: res.status }, "assistant model request failed");
      return null;
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim();
    return text || null;
  } catch (err) {
    logger.warn({ err }, "assistant model unavailable");
    return null;
  } finally {
    clearTimeout(timer);
  }
}
