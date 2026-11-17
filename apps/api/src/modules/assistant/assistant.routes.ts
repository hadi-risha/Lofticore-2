import { Router } from "express";
import { chatRequestSchema } from "@lofticore/shared";
import { chatLimiter } from "../../middleware/rate-limit";
import { validate } from "../../middleware/validate";
import { verifyAccessToken } from "../../lib/tokens";
import { answer } from "./assistant.service";

export const assistantRouter = Router();

// Open to guests (they can still ask about delivery and search products). A signed-in
// user also gets help with their own orders.
assistantRouter.post("/chat", chatLimiter, validate(chatRequestSchema), async (req, res) => {
  let userId: string | undefined;
  const header = req.header("authorization");
  if (header?.startsWith("Bearer ")) {
    try {
      userId = (await verifyAccessToken(header.slice(7))).userId;
    } catch {
      /* an expired token just means we treat them as a guest */
    }
  }
  res.json(await answer(req.body.message, req.body.history, userId));
});
