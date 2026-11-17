import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { KeyRound, PartyPopper } from "lucide-react";
import { OrderStatus, PaymentStatus, formatINR } from "@lofticore/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/bits";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ApiError } from "@/lib/api";
import { AddressSummary } from "@/features/account/address-form";
import { NotFoundPage } from "@/pages/not-found";
import { ReportButton } from "@/features/trust/report-dialog";
import { useCancelOrder, useOrder } from "../api";
import { OrderStatusBadge, PaymentStatusBadge, ShipmentTimeline, orderDate } from "../status";

export function OrderDetailPage() {
  const { orderId = "" } = useParams();
  const [params] = useSearchParams();
  const { data: order, error } = useOrder(orderId);
  const cancel = useCancelOrder(orderId);
  const [confirming, setConfirming] = useState(false);

  if (error instanceof ApiError && error.status === 404) return <NotFoundPage />;
  if (!order) {
    return (
      <div className="container-page max-w-4xl py-10">
        <Skeleton className="h-96" />
      </div>
    );
  }

  const justPlaced = params.get("placed") === "1";

  return (
    <div className="container-page max-w-4xl py-10">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted">
        <Link to="/orders" className="hover:text-brand">
          Your orders
        </Link>{" "}
        / <span className="text-ink">{order.orderNumber}</span>
      </nav>

      {justPlaced && order.status !== OrderStatus.CANCELLED && (
        <div
          className="mb-6 flex items-start gap-3 rounded-2xl bg-success/10 p-5 text-success"
          role="status"
        >
          <PartyPopper className="mt-0.5 size-6 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">Thank you! Your order is booked.</p>
            <p className="text-sm">
              We&apos;ve let the seller know. You can follow every step right here.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl">{order.orderNumber}</h1>
          <p className="mt-1 text-sm text-muted">Placed on {orderDate(order)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <OrderStatusBadge status={order.status} />
          {order.payment && <PaymentStatusBadge payment={order.payment} />}
        </div>
      </div>

      {order.status === OrderStatus.PENDING_PAYMENT &&
        order.payment?.status !== PaymentStatus.EXPIRED && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gold/20 p-5">
            <p className="text-sm">
              This order is waiting for payment. We&apos;re holding your items for a short while.
            </p>
            <Link to={`/pay/${order.id}`}>
              <Button>Complete payment</Button>
            </Link>
          </div>
        )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {order.shipments.map((s, i) => (
            <section key={s.id} className="rounded-2xl border border-line bg-white p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg">
                  {order.shipments.length > 1 ? `Parcel ${i + 1} · ` : ""}Sold by {s.seller.name}
                </h2>
              </div>

              <ul className="mt-4 divide-y divide-line">
                {s.items.map((it) => (
                  <li key={it.sku} className="flex gap-4 py-3 first:pt-0">
                    <img src={it.image} alt="" className="size-20 rounded-xl object-cover" />
                    <div className="flex-1 text-sm">
                      <Link
                        to={`/shop?q=${encodeURIComponent(it.title)}`}
                        className="font-medium hover:text-brand"
                      >
                        {it.title}
                      </Link>
                      {it.variantLabel && <p className="text-muted">{it.variantLabel}</p>}
                      <p className="text-muted">Qty {it.qty}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{formatINR(it.price * it.qty)}</p>
                      {s.status === "delivered" && it.slug && (
                        <Link
                          to={`/product/${it.slug}`}
                          className="mt-1 inline-block text-xs font-medium text-brand hover:underline"
                        >
                          Rate this
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {s.deliveryCode && (
                <div className="mt-5 flex items-center gap-4 rounded-xl bg-brand-soft p-4">
                  <KeyRound className="size-6 shrink-0 text-brand" aria-hidden />
                  <div className="flex-1 text-sm">
                    <p className="font-medium">Your delivery code</p>
                    <p className="text-muted">
                      Tell this to the delivery partner when the parcel arrives. Not before.
                    </p>
                  </div>
                  <p className="font-mono text-2xl font-semibold tracking-widest">
                    {s.deliveryCode}
                  </p>
                </div>
              )}

              <div className="mt-6 border-t border-line pt-5">
                <ShipmentTimeline shipment={s} />
              </div>
            </section>
          ))}
        </div>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="mb-3 text-lg">Delivering to</h2>
            <AddressSummary a={order.address} />
          </section>

          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="mb-3 text-lg">Payment</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Items</dt>
                <dd>{formatINR(order.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Delivery</dt>
                <dd>{order.deliveryFee === 0 ? "Free" : formatINR(order.deliveryFee)}</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
                <dt>Total</dt>
                <dd>{formatINR(order.total)}</dd>
              </div>
              {order.payment && (
                <div className="flex justify-between pt-1 text-muted">
                  <dt>Method</dt>
                  <dd>{order.payment.method === "cod" ? "Cash on delivery" : "UPI"}</dd>
                </div>
              )}
            </dl>
          </section>

          <ReportButton
            targetType="order"
            targetId={order.id}
            label={`Order ${order.orderNumber}`}
            reasons={["not_delivered", "damaged", "not_as_described", "scam", "other"]}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-line py-2.5 text-sm text-muted hover:border-danger hover:text-danger"
          >
            Something wrong with this order?
          </ReportButton>

          {order.canCancel && (
            <Button variant="secondary" className="w-full" onClick={() => setConfirming(true)}>
              Cancel order
            </Button>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={confirming}
        title="Cancel this order?"
        confirmLabel="Yes, cancel it"
        danger
        loading={cancel.isPending}
        onClose={() => setConfirming(false)}
        onConfirm={() => cancel.mutate(undefined, { onSettled: () => setConfirming(false) })}
      >
        {order.payment?.status === PaymentStatus.PAID
          ? "Your payment will be refunded."
          : "Nothing has been charged."}{" "}
        Once a seller has packed your parcel, it can no longer be cancelled.
      </ConfirmDialog>
    </div>
  );
}
