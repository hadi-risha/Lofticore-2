import { randomBytes, randomInt } from "node:crypto";
import mongoose, { type Types } from "mongoose";
import {
  AccountStatus,
  CANCELLABLE_SHIPMENT,
  COD_LIMIT,
  DELIVERY_FEE,
  NEW_ACCOUNT_COD_LIMIT,
  NEW_ACCOUNT_DAYS,
  ErrorCode,
  FREE_DELIVERY_ABOVE,
  HttpStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ProductStatus,
  Role,
  SHIPMENT_FLOW,
  ShipmentStatus,
  formatINR,
  type CheckoutInput,
  type OrderDTO,
  type ShipmentAction,
  type ShipmentDTO,
} from "@lofticore/shared";
import { AppError } from "../../lib/app-error";
import { audit } from "../audit/audit.model";
import { ownedAddress } from "../addresses/address.module";
import { Product } from "../catalog/product.model";
import {
  commitReservation,
  releaseReservation,
  reserveStock,
  restockUnits,
} from "../inventory/inventory.service";
import { User } from "../users/user.model";
import {
  closeOrder,
  createCodPayment,
  createUpiPayment,
  demoPaymentsEnabled,
  refundPayment,
  toPaymentDTO,
} from "../payments/payment.service";
import { announceOrderPlaced, announceShipment } from "./order-events";
import { createRazorpayPayment, razorpayEnabled } from "../payments/razorpay";
import {
  Order,
  Payment,
  type OrderDoc,
  type OrderItemShape,
  type ShipmentShape,
} from "./order.model";

const HOLD_MINUTES = 15;

const isDuplicateKey = (err: unknown) => (err as { code?: number })?.code === 11000;

/* ------------------------------------------------------------------- status */

// The order's overall status, worked out from its shipments.
export function deriveStatus(shipments: Pick<ShipmentShape, "status">[]): OrderStatus {
  const live = shipments.filter((s) => s.status !== ShipmentStatus.CANCELLED);
  if (live.length === 0) return OrderStatus.CANCELLED;
  if (live.every((s) => s.status === ShipmentStatus.DELIVERED)) return OrderStatus.DELIVERED;
  if (
    live.some(
      (s) =>
        s.status === ShipmentStatus.SHIPPED ||
        s.status === ShipmentStatus.OUT_FOR_DELIVERY ||
        s.status === ShipmentStatus.DELIVERED,
    )
  ) {
    return OrderStatus.SHIPPED;
  }
  if (live.some((s) => s.status === ShipmentStatus.CONFIRMED || s.status === ShipmentStatus.PACKED))
    return OrderStatus.PROCESSING;
  return OrderStatus.PLACED;
}

/* --------------------------------------------------------------------- DTOs */

type Viewer =
  | { role: "buyer" }
  | { role: "seller"; id: string }
  | { role: "delivery"; id: string }
  | { role: "staff" };

const itemDTO = (i: OrderItemShape) => ({
  productId: String(i.product),
  slug: i.slug,
  sku: i.sku,
  title: i.title,
  image: i.image,
  variantLabel: i.variantLabel,
  price: i.price,
  qty: i.qty,
});

export async function toOrderDTO(order: OrderDoc, viewer: Viewer): Promise<OrderDTO> {
  const sellerIds = [...new Set(order.shipments.map((s) => String(s.seller)))];
  const sellers = await User.find({ _id: { $in: sellerIds } })
    .select("name")
    .lean();
  const names = new Map(sellers.map((s) => [String(s._id), s.name]));

  // a seller or delivery partner only ever sees their own parcels
  const visible = order.shipments.filter((s) =>
    viewer.role === "seller"
      ? String(s.seller) === viewer.id
      : viewer.role === "delivery"
        ? String(s.agent) === viewer.id
        : true,
  );

  const shipments: ShipmentDTO[] = visible.map((s) => ({
    id: String(s._id),
    seller: { id: String(s.seller), name: names.get(String(s.seller)) ?? "Seller" },
    status: s.status,
    items: s.items.map(itemDTO),
    timeline: s.timeline.map((t) => ({ status: t.status, at: t.at.toISOString(), note: t.note })),
    // the code is for the customer to read out at the door, not for anyone else
    ...(viewer.role === "buyer" &&
    s.deliveryCode &&
    (s.status === ShipmentStatus.SHIPPED || s.status === ShipmentStatus.OUT_FOR_DELIVERY)
      ? { deliveryCode: s.deliveryCode }
      : {}),
  }));

  const payment = await Payment.findOne({ order: order._id }).sort({ attempt: -1 });
  const canCancel =
    order.status === OrderStatus.PENDING_PAYMENT ||
    (order.status !== OrderStatus.CANCELLED &&
      order.shipments.every(
        (s) => s.status === ShipmentStatus.CANCELLED || CANCELLABLE_SHIPMENT.includes(s.status),
      ));

  return {
    id: String(order._id),
    orderNumber: order.orderNumber,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    total: order.total,
    address: order.address as OrderDTO["address"],
    payment:
      viewer.role === "buyer" || viewer.role === "staff"
        ? payment
          ? toPaymentDTO(payment)
          : undefined
        : undefined,
    shipments,
    canCancel: viewer.role === "buyer" ? canCancel : false,
    ...(viewer.role === "staff" ? { customer: await customerOf(order.user) } : {}),
  };
}

async function customerOf(userId: Types.ObjectId) {
  const u = await User.findById(userId).select("name email").lean();
  return u ? { name: u.name, email: u.email } : undefined;
}

/* ----------------------------------------------------------------- checkout */

interface PricedLine {
  product: Types.ObjectId;
  slug: string;
  seller: Types.ObjectId;
  sku: string;
  title: string;
  image: string;
  variantLabel?: string;
  price: number;
  qty: number;
}

// Prices and titles come from the database, never from the browser. A tampered
// cart can change what's in it, but not what it costs.
async function priceCart(items: CheckoutInput["items"]): Promise<PricedLine[]> {
  const ids = [...new Set(items.map((i) => i.productId))];
  const products = await Product.find({ _id: { $in: ids }, status: ProductStatus.ACTIVE });
  const byId = new Map(products.map((p) => [String(p._id), p]));

  return items.map((it) => {
    const p = byId.get(it.productId);
    const v = p?.variants.find((x) => x.sku === it.sku);
    if (!p || !v) {
      throw AppError.badRequest(
        "An item in your cart is no longer available. Please review your cart.",
        ErrorCode.INVENTORY_INSUFFICIENT_STOCK,
      );
    }
    return {
      product: p._id,
      slug: p.slug,
      seller: p.seller,
      sku: v.sku,
      title: p.title,
      image: p.images[0]?.url ?? "",
      variantLabel: [v.color, v.size].filter(Boolean).join(" · ") || v.material,
      price: v.price,
      qty: it.qty,
    };
  });
}

function newOrderNumber() {
  const d = new Date();
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return `LC-${ymd}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function checkout(
  userId: string,
  input: CheckoutInput,
  requestId?: string,
): Promise<OrderDTO> {
  // same key again (double click, flaky network): hand back the order we already made
  const existing = await Order.findOne({ user: userId, idempotencyKey: input.idempotencyKey });
  if (existing) return toOrderDTO(existing, { role: "buyer" });

  const address = await ownedAddress(userId, input.addressId);
  const lines = await priceCart(input.items);

  const subtotal = lines.reduce((n, l) => n + l.price * l.qty, 0);
  const deliveryFee = subtotal >= FREE_DELIVERY_ABOVE ? 0 : DELIVERY_FEE;
  const total = subtotal + deliveryFee;

  if (input.paymentMethod === PaymentMethod.COD && total > COD_LIMIT) {
    throw new AppError(
      HttpStatus.BAD_REQUEST,
      ErrorCode.ORDER_COD_NOT_AVAILABLE,
      `Cash on delivery is available up to ${formatINR(COD_LIMIT)}. Please pay online for this order.`,
    );
  }

  // Without a payment gateway (or the demo switched on), online payment can't work.
  if (input.paymentMethod === PaymentMethod.RAZORPAY && !razorpayEnabled()) {
    throw new AppError(
      HttpStatus.SERVICE_UNAVAILABLE,
      ErrorCode.PAYMENT_PROVIDER_UNAVAILABLE,
      "Online payment isn't available right now. Please choose cash on delivery.",
    );
  }
  if (input.paymentMethod === PaymentMethod.UPI && !demoPaymentsEnabled()) {
    throw new AppError(
      HttpStatus.SERVICE_UNAVAILABLE,
      ErrorCode.PAYMENT_PROVIDER_UNAVAILABLE,
      "Online payment isn't available right now. Please choose cash on delivery.",
    );
  }

  // Brand-new accounts with nothing delivered yet get a lower cash-on-delivery cap -
  // the classic pattern for fake high-value COD orders.
  if (input.paymentMethod === PaymentMethod.COD && total > NEW_ACCOUNT_COD_LIMIT) {
    const buyer = await User.findById(userId).select("createdAt");
    const isNew =
      buyer && Date.now() - buyer.createdAt.getTime() < NEW_ACCOUNT_DAYS * 24 * 3600_000;
    if (isNew && !(await Order.exists({ user: userId, status: OrderStatus.DELIVERED }))) {
      throw new AppError(
        HttpStatus.BAD_REQUEST,
        ErrorCode.ORDER_COD_NOT_AVAILABLE,
        `New accounts can pay cash on delivery up to ${formatINR(NEW_ACCOUNT_COD_LIMIT)}. Please pay online for this order.`,
      );
    }
  }

  // hold the stock first; if anything below fails we give it back
  const reservation = await reserveStock(
    userId,
    lines.map((l) => ({ productId: String(l.product), sku: l.sku, qty: l.qty })),
    HOLD_MINUTES,
  );

  // one shipment per seller
  const bySeller = new Map<string, PricedLine[]>();
  for (const l of lines)
    bySeller.set(String(l.seller), [...(bySeller.get(String(l.seller)) ?? []), l]);
  const shipments = [...bySeller.entries()].map(([seller, items]) => ({
    seller,
    status: ShipmentStatus.PLACED,
    timeline: [{ status: ShipmentStatus.PLACED, at: new Date() }],
    items: items.map(({ seller: _s, ...rest }) => rest),
  }));

  let order: OrderDoc;
  try {
    order = await Order.create({
      orderNumber: newOrderNumber(),
      user: userId,
      idempotencyKey: input.idempotencyKey,
      address: {
        fullName: address.fullName,
        phone: address.phone,
        line1: address.line1,
        line2: address.line2,
        landmark: address.landmark,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
      },
      subtotal,
      deliveryFee,
      total,
      status: OrderStatus.PENDING_PAYMENT,
      paymentMethod: input.paymentMethod,
      reservation: reservation._id,
      shipments,
    });
  } catch (err) {
    await releaseReservation(String(reservation._id), "order could not be created");
    // two identical requests raced: the other one won, return its order
    if (isDuplicateKey(err)) {
      const winner = await Order.findOne({ user: userId, idempotencyKey: input.idempotencyKey });
      if (winner) return toOrderDTO(winner, { role: "buyer" });
    }
    throw err;
  }

  if (input.paymentMethod === PaymentMethod.COD) {
    await createCodPayment(String(order._id), userId, total);
    // nothing to wait for: the order is confirmed and the stock is sold
    await commitReservation(String(reservation._id), String(order._id));
    order.status = OrderStatus.PLACED;
    await order.save();
    await announceOrderPlaced(order);
  } else if (input.paymentMethod === PaymentMethod.RAZORPAY) {
    await createRazorpayPayment(
      String(order._id),
      order.orderNumber,
      userId,
      total,
      reservation.expiresAt,
    );
  } else {
    await createUpiPayment(String(order._id), userId, total, reservation.expiresAt);
  }

  await audit({
    action: "order.placed",
    actorId: userId,
    targetId: String(order._id),
    requestId,
    meta: { total, method: input.paymentMethod },
  });
  return toOrderDTO(order, { role: "buyer" });
}

/* ------------------------------------------------------------------ reading */

export async function listOrders(userId: string, page: number, limit = 10) {
  const [rows, total] = await Promise.all([
    Order.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Order.countDocuments({ user: userId }),
  ]);
  return {
    items: await Promise.all(rows.map((o) => toOrderDTO(o, { role: "buyer" }))),
    total,
    page,
    pages: Math.ceil(total / limit),
    limit,
  };
}

async function ownedOrder(userId: string, orderId: string) {
  if (!mongoose.isValidObjectId(orderId)) throw AppError.notFound("We couldn't find that order.");
  const o = await Order.findOne({ _id: orderId, user: userId });
  if (!o) throw AppError.notFound("We couldn't find that order.");
  return o;
}

export async function getOrder(userId: string, orderId: string) {
  return toOrderDTO(await ownedOrder(userId, orderId), { role: "buyer" });
}

export async function listSellerOrders(sellerId: string, page: number, limit = 10) {
  // orders still waiting for payment aren't the seller's business yet
  const filter = { "shipments.seller": sellerId, status: { $nin: [OrderStatus.PENDING_PAYMENT] } };
  const [rows, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Order.countDocuments(filter),
  ]);
  return {
    items: await Promise.all(rows.map((o) => toOrderDTO(o, { role: "seller", id: sellerId }))),
    total,
    page,
    pages: Math.ceil(total / limit),
    limit,
  };
}

export async function listAgentOrders(agentId: string) {
  const rows = await Order.find({
    "shipments.agent": agentId,
    status: { $ne: OrderStatus.CANCELLED },
  })
    .sort({ createdAt: -1 })
    .limit(50);
  return Promise.all(rows.map((o) => toOrderDTO(o, { role: "delivery", id: agentId })));
}

/* ------------------------------------------------------------- cancelling */

export async function cancelOrder(userId: string, orderId: string, requestId?: string) {
  const order = await ownedOrder(userId, orderId);
  if (order.status === OrderStatus.CANCELLED) return toOrderDTO(order, { role: "buyer" });
  await performCancel(order, userId, "Cancelled by customer", requestId);
  return getOrder(userId, orderId);
}

// An admin cancelling on someone's behalf (e.g. when blocking them). Same rules as
// the customer's own cancel: nothing that's already packed or shipped is touched.
export async function cancelOrderAsStaff(
  orderId: string,
  staffId: string,
  reason: string,
  requestId?: string,
) {
  const order = await Order.findById(orderId);
  if (!order || order.status === OrderStatus.CANCELLED) return false;
  await performCancel(order, staffId, reason, requestId);
  return true;
}

async function performCancel(
  order: OrderDoc,
  actorId: string,
  closeReason: string,
  requestId?: string,
) {
  const payment = await Payment.findOne({ order: order._id }).sort({ attempt: -1 });

  if (order.status === OrderStatus.PENDING_PAYMENT) {
    if (order.reservation)
      await releaseReservation(String(order.reservation), "order cancelled before payment");
    if (payment?.status === PaymentStatus.PENDING || payment?.status === PaymentStatus.FAILED) {
      payment.status = PaymentStatus.EXPIRED;
      payment.events.push({
        status: PaymentStatus.EXPIRED,
        at: new Date(),
        note: "order cancelled",
      });
      await payment.save();
    }
    await closeOrder(String(order._id), closeReason);
  } else {
    const blocked = order.shipments.some(
      (s) => s.status !== ShipmentStatus.CANCELLED && !CANCELLABLE_SHIPMENT.includes(s.status),
    );
    if (blocked) {
      throw new AppError(
        HttpStatus.CONFLICT,
        ErrorCode.ORDER_NOT_CANCELLABLE,
        "This order has already been packed or shipped, so it can't be cancelled. You can return it once it arrives.",
      );
    }
    await restockUnits(
      order.shipments.filter((s) => s.status !== ShipmentStatus.CANCELLED).flatMap((s) => s.items),
      String(order._id),
      closeReason.toLowerCase(),
    );
    await closeOrder(String(order._id), closeReason);

    if (payment?.status === PaymentStatus.PAID)
      await refundPayment(payment, closeReason.toLowerCase());
    else if (payment?.status === PaymentStatus.PENDING) {
      // cash on delivery: nothing was collected
      payment.status = PaymentStatus.EXPIRED;
      payment.events.push({
        status: PaymentStatus.EXPIRED,
        at: new Date(),
        note: "order cancelled",
      });
      await payment.save();
    }
  }

  await audit({
    action: "order.cancelled",
    actorId,
    targetId: String(order._id),
    requestId,
    meta: { reason: closeReason },
  });
}

// When a seller is blocked: their parcels that haven't been packed are cancelled and
// refunded for those items. Packed or shipped parcels are left for an admin to finish.
export async function cancelSellerShipments(sellerId: string, staffId: string, reason: string) {
  const orders = await Order.find({
    "shipments.seller": sellerId,
    status: { $nin: [OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED, OrderStatus.DELIVERED] },
  });

  let cancelled = 0;
  for (const order of orders) {
    for (const sh of order.shipments) {
      if (String(sh.seller) !== sellerId || !CANCELLABLE_SHIPMENT.includes(sh.status)) continue;

      await restockUnits(sh.items, String(order._id), reason.toLowerCase());
      await Order.updateOne(
        { _id: order._id, "shipments._id": sh._id },
        {
          $set: { "shipments.$.status": ShipmentStatus.CANCELLED },
          $push: {
            "shipments.$.timeline": {
              status: ShipmentStatus.CANCELLED,
              at: new Date(),
              note: reason,
            },
          },
        },
      );

      const refund = sh.items.reduce((n, i) => n + i.price * i.qty, 0);
      const payment = await Payment.findOne({ order: order._id }).sort({ attempt: -1 });
      if (payment?.status === PaymentStatus.PAID) {
        payment.refundedAmount = (payment.refundedAmount ?? 0) + refund;
        payment.events.push({
          status: PaymentStatus.PAID,
          at: new Date(),
          note: "partial refund of " + formatINR(refund) + ": " + reason,
        });
        await payment.save();
      }
      cancelled += 1;
    }

    const fresh = (await Order.findById(order._id))!;
    fresh.status = deriveStatus(fresh.shipments);
    if (fresh.status === OrderStatus.CANCELLED) {
      fresh.cancelReason = reason;
      const payment = await Payment.findOne({ order: order._id }).sort({ attempt: -1 });
      if (payment?.status === PaymentStatus.PAID)
        await refundPayment(payment, reason.toLowerCase());
    }
    await fresh.save();
  }
  await audit({
    action: "seller.shipments_cancelled",
    actorId: staffId,
    targetId: sellerId,
    meta: { cancelled, reason },
  });
  return cancelled;
}

// Called on a timer for UPI orders whose payment window ran out.
export async function expireUnpaidOrders(limit = 100) {
  const stale = await Payment.find({
    provider: "mock_upi",
    status: { $in: [PaymentStatus.PENDING, PaymentStatus.FAILED] },
    expiresAt: { $lt: new Date() },
  }).limit(limit);

  let closed = 0;
  for (const p of stale) {
    const order = await Order.findById(p.order);
    if (order?.status === OrderStatus.PENDING_PAYMENT) {
      if (order.reservation)
        await releaseReservation(String(order.reservation), "payment window ended");
      await closeOrder(String(order._id), "Payment was not completed in time");
      closed += 1;
    }
    p.status = PaymentStatus.EXPIRED;
    p.events.push({ status: PaymentStatus.EXPIRED, at: new Date(), note: "payment window ended" });
    await p.save();
  }
  return closed;
}

/* -------------------------------------------------------- shipment progress */

interface Actor {
  id: string;
  role: Role;
}

const SELLER_ACTIONS: ShipmentAction[] = ["confirm", "pack", "ship"];
const DELIVERY_ACTIONS: ShipmentAction[] = ["out_for_delivery", "deliver"];

export async function advanceShipment(
  actor: Actor,
  orderId: string,
  shipmentId: string,
  action: ShipmentAction,
  opts: { deliveryCode?: string; note?: string },
  requestId?: string,
) {
  if (!mongoose.isValidObjectId(orderId) || !mongoose.isValidObjectId(shipmentId))
    throw AppError.notFound();
  const order = await Order.findById(orderId);
  const shipment = order?.shipments.find((s) => String(s._id) === shipmentId);
  if (!order || !shipment || order.status === OrderStatus.PENDING_PAYMENT)
    throw AppError.notFound("We couldn't find that shipment.");

  // who is allowed to do what
  const isStaff = actor.role === Role.ADMIN || actor.role === Role.SUPER_ADMIN;
  const sellerOk =
    actor.role === Role.SELLER &&
    String(shipment.seller) === actor.id &&
    SELLER_ACTIONS.includes(action);
  const agentOk =
    actor.role === Role.DELIVERY &&
    String(shipment.agent) === actor.id &&
    DELIVERY_ACTIONS.includes(action);
  if (!isStaff && !sellerOk && !agentOk) throw AppError.notFound("We couldn't find that shipment.");

  const step = SHIPMENT_FLOW[action];
  if (shipment.status !== step.from) {
    throw new AppError(
      HttpStatus.CONFLICT,
      ErrorCode.ORDER_INVALID_TRANSITION,
      `This parcel is "${shipment.status.replace(/_/g, " ")}", so it can't be marked "${action.replace(/_/g, " ")}" yet.`,
    );
  }
  if (action === "out_for_delivery" && !shipment.agent) {
    throw AppError.badRequest(
      "Assign a delivery partner before sending this out for delivery.",
      ErrorCode.ORDER_INVALID_TRANSITION,
    );
  }
  if (action === "deliver" && shipment.deliveryCode !== opts.deliveryCode) {
    throw new AppError(
      HttpStatus.BAD_REQUEST,
      ErrorCode.ORDER_BAD_DELIVERY_CODE,
      "That delivery code isn't right. Ask the customer for the 4-digit code.",
    );
  }

  const set: Record<string, unknown> = { "shipments.$.status": step.to };
  if (action === "ship") set["shipments.$.deliveryCode"] = String(randomInt(1000, 10000));

  // conditional on the current status, so two clicks can't both succeed
  const res = await Order.updateOne(
    { _id: orderId, shipments: { $elemMatch: { _id: shipmentId, status: step.from } } },
    {
      $set: set,
      $push: { "shipments.$.timeline": { status: step.to, at: new Date(), note: opts.note } },
    },
  );
  if (res.matchedCount === 0) {
    throw new AppError(
      HttpStatus.CONFLICT,
      ErrorCode.ORDER_INVALID_TRANSITION,
      "Someone else just updated this parcel. Refresh and try again.",
    );
  }

  const fresh = (await Order.findById(orderId))!;
  fresh.status = deriveStatus(fresh.shipments);
  await fresh.save();

  // cash is handed over at the door; once everything has arrived, it's paid
  if (fresh.status === OrderStatus.DELIVERED && fresh.paymentMethod === PaymentMethod.COD) {
    const p = await Payment.findOne({ order: fresh._id, method: PaymentMethod.COD });
    if (p && p.status === PaymentStatus.PENDING) {
      p.status = PaymentStatus.PAID;
      p.events.push({
        status: PaymentStatus.PAID,
        at: new Date(),
        note: "cash collected on delivery",
      });
      await p.save();
    }
  }

  if (
    step.to === ShipmentStatus.SHIPPED ||
    step.to === ShipmentStatus.OUT_FOR_DELIVERY ||
    step.to === ShipmentStatus.DELIVERED
  ) {
    await announceShipment(fresh, step.to);
  }

  await audit({
    action: `shipment.${action}`,
    actorId: actor.id,
    targetId: shipmentId,
    requestId,
    meta: { orderId },
  });
  return toOrderDTO(
    fresh,
    isStaff
      ? { role: "staff" }
      : actor.role === Role.SELLER
        ? { role: "seller", id: actor.id }
        : { role: "delivery", id: actor.id },
  );
}

export async function assignAgent(
  adminId: string,
  orderId: string,
  shipmentId: string,
  agentId: string,
  requestId?: string,
) {
  const agent = await User.findOne({
    _id: agentId,
    role: Role.DELIVERY,
    status: AccountStatus.ACTIVE,
  });
  if (!agent) throw AppError.badRequest("That delivery partner isn't available.");

  const res = await Order.updateOne(
    {
      _id: orderId,
      "shipments._id": shipmentId,
      status: { $nin: [OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED] },
    },
    { $set: { "shipments.$.agent": agent._id } },
  );
  if (res.matchedCount === 0) throw AppError.notFound("We couldn't find that shipment.");
  await audit({
    action: "shipment.assign_agent",
    actorId: adminId,
    targetId: shipmentId,
    requestId,
    meta: { agentId },
  });
}

export async function listAllOrders(status: string | undefined, page: number, limit = 15) {
  const filter = status ? { status } : { status: { $ne: OrderStatus.PENDING_PAYMENT } };
  const [rows, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Order.countDocuments(filter),
  ]);
  return {
    items: await Promise.all(rows.map((o) => toOrderDTO(o, { role: "staff" }))),
    total,
    page,
    pages: Math.ceil(total / limit),
    limit,
  };
}
