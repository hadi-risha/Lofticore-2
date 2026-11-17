import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, CreditCard, ExternalLink, Smartphone, XCircle } from "lucide-react";
import { toast } from "sonner";
import { OrderStatus, PaymentStatus, formatINR } from "@lofticore/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/bits";
import { ApiError } from "@/lib/api";
import { NotFoundPage } from "@/pages/not-found";
import { useAuthStore } from "@/stores/auth.store";
import { useCancelOrder, useOrder, useRetryPayment, useVerifyRazorpay } from "../api";
import { openRazorpay } from "../razorpay";

function useCountdown(until?: string) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!until) return;
    const tick = () =>
      setLeft(Math.max(0, Math.round((new Date(until).getTime() - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [until]);
  return left;
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// The page the customer waits on while paying in their UPI app. It asks the server
// every few seconds; the moment the provider's callback lands, it moves on.
export function PayPage() {
  const { orderId = "" } = useParams();
  const navigate = useNavigate();
  const { data: order, error } = useOrder(orderId, { poll: true });
  const retry = useRetryPayment(orderId);
  const verify = useVerifyRazorpay(orderId);
  const user = useAuthStore((s) => s.user);
  const cancel = useCancelOrder(orderId);
  const countdown = useCountdown(order?.payment?.expiresAt);
  const payment = order?.payment;

  // paid: tell them and move to the order
  useEffect(() => {
    if (
      order &&
      order.status !== OrderStatus.PENDING_PAYMENT &&
      order.status !== OrderStatus.CANCELLED &&
      payment?.status === PaymentStatus.PAID
    ) {
      toast.success("Payment received. Your order is booked!");
      navigate(`/orders/${order.id}?placed=1`, { replace: true });
    }
  }, [order, payment?.status, navigate]);

  const payWithRazorpay = () => {
    const rz = payment?.razorpay;
    if (!order || !payment || !rz) return;
    openRazorpay({
      keyId: rz.keyId,
      orderId: rz.orderId,
      amount: payment.amount,
      description: `Order ${order.orderNumber}`,
      prefill: {
        name: user?.name,
        email: user?.email,
      },
      onSuccess: (r) => verify.mutate({ paymentId: payment.id, ...r }),
      onFailure: (reason) => toast.error(reason),
      onDismiss: () => {},
    }).catch((e: Error) => toast.error(e.message));
  };

  if (error instanceof ApiError && error.status === 404) return <NotFoundPage />;
  if (!order || !payment) {
    return (
      <div className="container-page max-w-lg py-16">
        <Skeleton className="h-64" />
      </div>
    );
  }

  const failed =
    payment.status === PaymentStatus.FAILED && order.status === OrderStatus.PENDING_PAYMENT;
  const closed = order.status === OrderStatus.CANCELLED;
  const waiting =
    payment.status === PaymentStatus.PENDING && order.status === OrderStatus.PENDING_PAYMENT;
  const ranOut = waiting && countdown === 0;

  return (
    <div className="container-page max-w-lg py-12">
      <div className="rounded-3xl border border-line bg-white p-7 text-center shadow-sm sm:p-9">
        {closed ? (
          <>
            <XCircle className="mx-auto size-12 text-danger" aria-hidden />
            <h1 className="mt-4 text-2xl">This order was closed</h1>
            <p className="mt-2 text-sm text-muted">
              {payment.status === PaymentStatus.REFUNDED
                ? "Your payment is being refunded."
                : "No money was taken."}{" "}
              Your cart items are still available in the shop.
            </p>
            <Link to="/shop" className="mt-6 inline-block">
              <Button>Back to the shop</Button>
            </Link>
          </>
        ) : failed ? (
          <>
            <XCircle className="mx-auto size-12 text-danger" aria-hidden />
            <h1 className="mt-4 text-2xl">Payment didn&apos;t go through</h1>
            <p className="mt-2 text-sm text-muted">
              No money was taken. We&apos;re still holding your items
              {countdown ? ` for ${mmss(countdown)}` : ""}, so you can try again.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <Button size="lg" loading={retry.isPending} onClick={() => retry.mutate(payment.id)}>
                Try again
              </Button>
              <Button
                variant="ghost"
                loading={cancel.isPending}
                onClick={() => cancel.mutate(undefined, { onSuccess: () => navigate("/cart") })}
              >
                Cancel order
              </Button>
            </div>
          </>
        ) : ranOut ? (
          <>
            <XCircle className="mx-auto size-12 text-danger" aria-hidden />
            <h1 className="mt-4 text-2xl">Time ran out</h1>
            <p className="mt-2 text-sm text-muted">
              We couldn&apos;t hold your items any longer. Nothing was charged. If money left your
              account, it will be refunded.
            </p>
            <Link to="/cart" className="mt-6 inline-block">
              <Button>Back to cart</Button>
            </Link>
          </>
        ) : (
          <>
            <div className="mx-auto grid size-14 place-items-center rounded-full bg-brand-soft text-brand">
              <Smartphone className="size-7" aria-hidden />
            </div>
            <h1 className="mt-4 text-2xl">Complete your payment</h1>
            <p className="mt-1 text-sm text-muted">Order {order.orderNumber}</p>
            <p className="mt-5 font-display text-4xl">{formatINR(payment.amount)}</p>

            <div className="mt-7 space-y-3">
              {payment.razorpay && (
                <Button
                  size="lg"
                  className="w-full"
                  loading={verify.isPending}
                  onClick={payWithRazorpay}
                >
                  <CreditCard className="size-4" aria-hidden /> Pay with Razorpay
                </Button>
              )}
              {payment.upiLink && (
                <a href={payment.upiLink} className="block">
                  <Button size="lg" className="w-full">
                    <Smartphone className="size-4" aria-hidden /> Pay with your UPI app
                  </Button>
                </a>
              )}
              {payment.mockAppUrl && (
                <Button
                  size="lg"
                  variant="secondary"
                  className="w-full"
                  onClick={() => window.open(payment.mockAppUrl, "_blank", "width=420,height=760")}
                >
                  <ExternalLink className="size-4" aria-hidden /> Open demo UPI app
                </Button>
              )}
            </div>

            <p
              className="mt-6 flex items-center justify-center gap-2 text-sm text-muted"
              role="status"
              aria-live="polite"
            >
              <span className="size-2 animate-pulse rounded-full bg-gold" aria-hidden />
              Waiting for payment confirmation{countdown ? ` · ${mmss(countdown)} left` : ""}
            </p>
            <p className="mt-2 text-xs text-muted">
              You can keep this page open. It updates by itself as soon as the payment is confirmed.
            </p>

            <button
              className="mt-6 text-sm text-muted underline hover:text-danger"
              onClick={() => cancel.mutate(undefined, { onSuccess: () => navigate("/cart") })}
            >
              Cancel this order
            </button>
          </>
        )}
        {payment.status === PaymentStatus.PAID && !closed && (
          <div className="mt-4 flex items-center justify-center gap-2 text-success" role="status">
            <CheckCircle2 className="size-5" aria-hidden /> Payment received
          </div>
        )}
      </div>
    </div>
  );
}
