import { formatINR } from "@lofticore/shared";
import { notify } from "../notifications/notification.module";
import type { OrderDoc } from "./order.model";

// What people get told when an order's life changes. Kept apart from the order and
// payment services so both can use it without importing each other.

export async function announceOrderPlaced(order: OrderDoc) {
  await notify(order.user, {
    type: "order.placed",
    title: "Your order is booked",
    body: `${order.orderNumber} · ${formatINR(order.total)}. We've let the seller know.`,
    link: `/orders/${order._id}`,
  });
  await notify(
    order.shipments.map((s) => s.seller),
    {
      type: "order.new",
      title: "New order to confirm",
      body: `${order.orderNumber} is waiting for you.`,
      link: "/seller/orders",
    },
  );
}

export const announcePaymentFailed = (
  order: Pick<OrderDoc, "user" | "_id" | "orderNumber">,
  reason?: string,
) =>
  notify(order.user, {
    type: "payment.failed",
    title: "Payment didn't go through",
    body: `${reason ?? "The payment failed"} for ${order.orderNumber}. Your items are held for a few minutes - you can try again.`,
    link: `/pay/${order._id}`,
  });

export const announceShipment = (
  order: Pick<OrderDoc, "user" | "_id" | "orderNumber">,
  status: "shipped" | "out_for_delivery" | "delivered",
) => {
  const copy = {
    shipped: { title: "Your parcel has been shipped", body: `${order.orderNumber} is on its way.` },
    out_for_delivery: {
      title: "Out for delivery today",
      body: `Keep your 4-digit delivery code ready for ${order.orderNumber}.`,
    },
    delivered: {
      title: "Delivered! How is it?",
      body: `${order.orderNumber} has arrived. Tell others what you think.`,
    },
  }[status];
  return notify(order.user, { type: `shipment.${status}`, ...copy, link: `/orders/${order._id}` });
};
