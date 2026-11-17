import { z } from "zod";
import type { ProductSummary } from "./catalog";

export const chatRequestSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Type a question first.")
    .max(500, "That's a bit long - try a shorter question."),
  // the last few turns, so follow-up questions make sense to the language model
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(1000) }))
    .max(6)
    .default([]),
});

export interface ChatReply {
  reply: string;
  // quick-reply chips shown under the answer
  suggestions?: string[];
  products?: ProductSummary[];
  links?: { label: string; to: string }[];
  // asks the app to do something, like start the guided tour
  action?: "start_tour";
  // "rules" = answered from the built-in guide, "ai" = answered by the language model
  source: "rules" | "ai" | "search";
}
