import { useState, type ReactNode } from "react";
import {
  formatINR,
  ShipmentStatus,
  type OrderDTO,
  type ShipmentAction,
  type ShipmentDTO,
} from "@lofticore/shared";
import { Button } from "@/components/ui/button";
import { Pill, prettyStatus, statusTone, when } from "./ui";
import { useAdvanceShipment } from "./api";

const NEXT: Partial<Record<ShipmentStatus, { action: ShipmentAction; label: string }>> = {
  placed: { action: "confirm", label: "Confirm order" },
  confirmed: { action: "pack", label: "Mark as packed" },
  packed: { action: "ship", label: "Mark as shipped" },
  shipped: { action: "out_for_delivery", label: "Start delivery" },
};

interface Props {
  order: OrderDTO;
  shipment: ShipmentDTO;
  // which kinds of step this person may take
  can: ShipmentAction[];
  invalidate: string[];
  extra?: ReactNode;
}

// One parcel with the single button that moves it forward - or, at the door, the
// field for the customer's code.
export function ShipmentCard({ order, shipment, can, invalidate, extra }: Props) {
  const advance = useAdvanceShipment(invalidate);
  const [code, setCode] = useState("");
  const next = NEXT[shipment.status];
  const last = shipment.status === ShipmentStatus.OUT_FOR_DELIVERY && can.includes("deliver");

  const run = (action: ShipmentAction, deliveryCode?: string) =>
    advance.mutate(
      { orderId: order.id, shipmentId: shipment.id, action, deliveryCode },
      { onSuccess: () => setCode("") },
    );

  return (
    <article className="rounded-2xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{order.orderNumber}</p>
          <p className="text-xs text-muted">
            {when(order.createdAt)}
            {order.customer && ` · ${order.customer.name}`}
          </p>
        </div>
        <Pill tone={statusTone(shipment.status)}>{prettyStatus(shipment.status)}</Pill>
      </div>

      <ul className="mt-4 space-y-2 text-sm">
        {shipment.items.map((i) => (
          <li key={i.sku} className="flex items-center gap-3">
            <img src={i.image} alt="" className="size-10 rounded-lg object-cover" />
            <span className="flex-1">
              {i.title}
              {i.variantLabel && <span className="text-muted"> · {i.variantLabel}</span>}
            </span>
            <span className="text-muted">×{i.qty}</span>
            <span className="w-24 text-right font-medium">{formatINR(i.price * i.qty)}</span>
          </li>
        ))}
      </ul>

      <address className="mt-4 rounded-xl bg-brand-soft/70 p-3 text-xs not-italic leading-relaxed">
        <strong>Deliver to:</strong> {order.address.fullName}, {order.address.line1}
        {order.address.line2 ? `, ${order.address.line2}` : ""}, {order.address.city}{" "}
        {order.address.pincode} · {order.address.phone}
      </address>

      {extra}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {next && can.includes(next.action) && (
          <Button size="sm" onClick={() => run(next.action)} loading={advance.isPending}>
            {next.label}
          </Button>
        )}
        {last && (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.length === 4) run("deliver", code);
            }}
          >
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              aria-label="Customer's 4-digit delivery code"
              placeholder="Code"
              className="h-9 w-24 rounded-lg border border-line px-3 text-center font-mono tracking-widest outline-none focus:border-brand"
            />
            <Button
              size="sm"
              type="submit"
              disabled={code.length !== 4}
              loading={advance.isPending}
            >
              Mark delivered
            </Button>
          </form>
        )}
        {shipment.status === ShipmentStatus.DELIVERED && (
          <span className="text-sm text-success">Delivered</span>
        )}
      </div>
    </article>
  );
}
