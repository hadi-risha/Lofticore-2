import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { connectDb, disconnectDb } from "./db/connect";
import { releaseExpiredReservations } from "./modules/inventory/inventory.service";
import { refreshTrending } from "./modules/recommendations/recommendation.module";
import { startMailWorker } from "./lib/mailer";
import { startSearchSync } from "./lib/search";
import { expireUnpaidOrders } from "./modules/orders/order.service";

async function main() {
  await connectDb();
  const mailWorker = startMailWorker();
  const stopSearchSync = startSearchSync();

  const server = createApp().listen(env.PORT, () => {
    logger.info(`api listening on http://localhost:${env.PORT}`);
  });

  // Give stock back from checkouts nobody finished. Safe on several instances at
  // once: each release is a conditional update, so only one of them wins.
  const sweeper = setInterval(async () => {
    try {
      const closed = await expireUnpaidOrders();
      const released = await releaseExpiredReservations();
      if (closed || released)
        logger.info({ closed, released }, "cleaned up unpaid orders and stock holds");
    } catch (err) {
      logger.error({ err }, "stock hold sweep failed");
    }
  }, 60_000);
  sweeper.unref();

  // keep the best-sellers ranking fresh
  const trending = setInterval(
    () => refreshTrending().catch((err) => logger.error({ err }, "trending refresh failed")),
    10 * 60_000,
  );
  trending.unref();
  void refreshTrending().catch((err) => logger.error({ err }, "trending refresh failed"));

  // let in-flight requests finish before we go down
  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    clearInterval(sweeper);
    stopSearchSync();
    clearInterval(trending);
    server.close(async () => {
      await mailWorker?.close();
      await disconnectDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal({ err }, "failed to start");
  process.exit(1);
});
