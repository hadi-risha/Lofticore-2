import { Check } from "lucide-react";
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ShipmentStatus,
  type OrderDTO,
  type PaymentDTO,
  type ShipmentDTO,
} from "@lofticore/shared";
import { cn } from "@/lib/cn";

const ORDER_LABEL: Record<OrderStatus, string> = {
  pending_payment: "Awaiting payment",
  placed: "Booked",
  processing: "Being prepared",
  shipped: "On the way",
  delivered: "Received",
  cancelled: "Cancelled",
};

const ORDER_TONE: Record<OrderStatus, string> = {
  pending_payment: "bg-gold/25 text-bronze",
  placed: "bg-brand-soft text-brand",
  processing: "bg-brand-soft text-brand",
  shipped: "bg-brand/15 text-brand",
  delivered: "bg-success/15 text-success",
  cancelled: "bg-danger/10 text-danger",
};

const pill = "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold";

export const OrderStatusBadge = ({ status }: { status: OrderStatus }) => (
  <span className={cn(pill, ORDER_TONE[status])}>{ORDER_LABEL[status]}</span>
);

export function paymentLabel(p: Pick<PaymentDTO, "method" | "status">) {
  if (p.status === PaymentStatus.PENDING)
    return p.method === PaymentMethod.COD ? "Pay on delivery" : "Awaiting payment";
  return {
    paid: "Paid",
    failed: "Payment failed",
    expired: p.method === PaymentMethod.COD ? "Not collected" : "Expired",
    refunded: "Refunded",
  }[p.status];
}

export const PaymentStatusBadge = ({ payment }: { payment: PaymentDTO }) => {
  const tone =
    payment.status === PaymentStatus.PAID
      ? "bg-success/15 text-success"
      : payment.status === PaymentStatus.FAILED
        ? "bg-danger/10 text-danger"
        : payment.status === PaymentStatus.REFUNDED
          ? "bg-brand-soft text-brand"
          : "bg-gold/25 text-bronze";
  return <span className={cn(pill, tone)}>{paymentLabel(payment)}</span>;
};

const STEPS: { status: ShipmentStatus; label: string }[] = [
  { status: ShipmentStatus.PLACED, label: "Booked" },
  { status: ShipmentStatus.CONFIRMED, label: "Confirmed" },
  { status: ShipmentStatus.PACKED, label: "Packed" },
  { status: ShipmentStatus.SHIPPED, label: "Shipped" },
  { status: ShipmentStatus.OUT_FOR_DELIVERY, label: "Out for delivery" },
  { status: ShipmentStatus.DELIVERED, label: "Received" },
];

// The parcel's journey as a vertical timeline, with the date of each step reached.
export function ShipmentTimeline({ shipment }: { shipment: ShipmentDTO }) {
  if (shipment.status === ShipmentStatus.CANCELLED) {
    return <p className="text-sm text-danger">This parcel was cancelled.</p>;
  }
  const reached = new Map(shipment.timeline.map((t) => [t.status, t.at]));
  return (
    <ol className="space-y-3">
      {STEPS.map((s) => {
        const at = reached.get(s.status);
        return (
          <li key={s.status} className="flex items-center gap-3">
            <span
              className={cn(
                "grid size-6 place-items-center rounded-full border-2",
                at ? "border-brand bg-brand text-white" : "border-line bg-white",
              )}
            >
              {at && <Check className="size-3.5" aria-hidden />}
            </span>
            <span className={cn("text-sm", at ? "font-medium" : "text-muted")}>{s.label}</span>
            {at && (
              <span className="ml-auto text-xs text-muted">
                {new Date(at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export const orderDate = (o: Pick<OrderDTO, "createdAt">) =>
  new Date(o.createdAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
