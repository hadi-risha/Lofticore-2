// Development helper: marks a customer's most recent order as delivered, so the
// review flow can be tried without walking a parcel through every step.
// Run: npm run dev:deliver -w @lofticore/api -- maya@example.com
import { OrderStatus, ShipmentStatus } from "@lofticore/shared";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { connectDb, disconnectDb } from "../db/connect";
import { Order } from "../modules/orders/order.model";
import { User } from "../modules/users/user.model";

async function main() {
  if (env.isProd) throw new Error("Not available in production.");
  const email = process.argv[2]?.toLowerCase();
  if (!email) throw new Error("Usage: npm run dev:deliver -w @lofticore/api -- <customer email>");

  await connectDb();
  const user = await User.findOne({ email });
  if (!user) throw new Error(`No account with the email ${email}`);

  const order = await Order.findOne({
    user: user._id,
    status: { $ne: OrderStatus.CANCELLED },
  }).sort({ createdAt: -1 });
  if (!order) throw new Error("That customer has no orders.");

  for (const s of order.shipments) {
    s.status = ShipmentStatus.DELIVERED;
    s.timeline.push({
      status: ShipmentStatus.DELIVERED,
      at: new Date(),
      note: "marked delivered by dev script",
    });
  }
  order.status = OrderStatus.DELIVERED;
  await order.save();
  logger.info(`order ${order.orderNumber} is now delivered`);
}

main()
  .catch((err) => {
    logger.fatal({ err }, "failed");
    process.exitCode = 1;
  })
  .finally(disconnectDb);
