import { Router, type Response } from "express";
import { authenticate } from "../../middleware/authenticate";
import { subscribe } from "../../lib/realtime";

export const realtimeRouter = Router();

// GET /api/events - one long-lived response per signed-in browser tab. The server writes
// a small message whenever one of the user's orders or notifications changes, and the web
// app refetches what it is showing. Replaces polling every few seconds.
realtimeRouter.get("/", authenticate, (req, res: Response & { flush?: () => void }) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // tell nginx-style proxies not to buffer
  });
  const write = (chunk: string) => {
    res.write(chunk);
    res.flush?.(); // compression middleware buffers unless flushed
  };
  write("retry: 3000\n\n");

  const unsubscribe = subscribe(req.user!.id, (event) =>
    write(`event: change\ndata: ${JSON.stringify(event)}\n\n`),
  );
  // proxies close idle connections; a comment every 25 s keeps this one open
  const heartbeat = setInterval(() => write(": ping\n\n"), 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});
