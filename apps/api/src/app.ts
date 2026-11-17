import express from "express";
import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./config/env";
import { PUBLIC_DIR } from "./config/paths";
import { logger } from "./config/logger";
import { requestId } from "./middleware/request-id";
import { apiLimiter } from "./middleware/rate-limit";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { healthRouter } from "./modules/health/health.routes";
import { authRouter } from "./modules/auth/auth.routes";
import { userRouter } from "./modules/users/user.routes";
import { catalogRouter } from "./modules/catalog/catalog.routes";
import { sellerProductsRouter } from "./modules/catalog/seller-products.routes";
import { adminCatalogRouter } from "./modules/catalog/admin-catalog.routes";
import { adminRouter } from "./modules/admin/admin.routes";
import { sellerStatsRouter } from "./modules/catalog/seller-stats.routes";
import { uploadRouter } from "./modules/uploads/upload.routes";
import { notificationRouter } from "./modules/notifications/notification.module";
import { reviewRouter } from "./modules/reviews/review.module";
import { adminReportRouter, reportRouter } from "./modules/reports/report.module";
import { recommendationRouter } from "./modules/recommendations/recommendation.module";
import { assistantRouter } from "./modules/assistant/assistant.routes";
import { addressRouter } from "./modules/addresses/address.module";
import { statusRouter } from "./modules/health/status.routes";
import { docsRouter } from "./modules/docs/docs.routes";
import { realtimeRouter } from "./modules/realtime/realtime.routes";
import { wishlistRouter } from "./modules/wishlist/wishlist.module";
import {
  adminShipmentRouter,
  checkoutRouter,
  deliveryRouter,
  mockUpiRouter,
  orderRouter,
  paymentRouter,
  sellerOrderRouter,
  shipmentRouter,
} from "./modules/orders/order.routes";

export function createApp() {
  const app = express();

  // behind a proxy in production (Render, Fly...) so req.ip is the real client
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => String((req as { id?: string }).id),
      autoLogging: { ignore: (req) => req.url === "/health" },
    }),
  );
  app.use(helmet());
  app.use(
    compression({
      filter: (req, res) => !req.path.startsWith("/api/events") && compression.filter(req, res),
    }),
  );
  app.use(
    cors({
      origin: env.clientOrigins,
      credentials: true,
      exposedHeaders: ["X-Request-Id"],
    }),
  );
  app.use(
    express.json({
      limit: "100kb",
      // payment callbacks are signed over the exact bytes, so keep a copy of them
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(cookieParser());

  app.use(healthRouter);

  // Product images. Helmet's default would stop the web app (another origin) from
  // showing them, so these are explicitly marked as embeddable.
  app.use(
    "/static",
    express.static(PUBLIC_DIR, {
      maxAge: "7d",
      setHeaders: (res) => res.setHeader("Cross-Origin-Resource-Policy", "cross-origin"),
    }),
  );

  const api = express.Router();
  api.use(apiLimiter);
  api.use("/events", realtimeRouter);
  api.use("/status", statusRouter);
  api.use("/docs", docsRouter);
  api.use("/auth", authRouter);
  api.use("/users", userRouter);
  api.use(catalogRouter);
  api.use("/seller/products", sellerProductsRouter);
  api.use("/admin", adminCatalogRouter);
  api.use("/admin", adminRouter);
  api.use("/admin/reports", adminReportRouter);
  api.use(reviewRouter);
  api.use("/reports", reportRouter);
  api.use("/notifications", notificationRouter);
  api.use("/recommendations", recommendationRouter);
  api.use("/assistant", assistantRouter);
  api.use("/seller/stats", sellerStatsRouter);
  api.use("/uploads", uploadRouter);
  api.use("/addresses", addressRouter);
  api.use("/wishlist", wishlistRouter);
  api.use("/checkout", checkoutRouter);
  api.use("/orders", orderRouter);
  api.use("/payments", paymentRouter);
  api.use("/mock-upi", mockUpiRouter);
  api.use("/seller/orders", sellerOrderRouter);
  api.use("/delivery", deliveryRouter);
  api.use("/shipments", shipmentRouter);
  api.use("/admin/shipments", adminShipmentRouter);
  app.use("/api", api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
