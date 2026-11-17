import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Banknote, CreditCard, Plus, Smartphone } from "lucide-react";
import {
  COD_LIMIT,
  DELIVERY_FEE,
  FREE_DELIVERY_ABOVE,
  NEW_ACCOUNT_COD_LIMIT,
  NEW_ACCOUNT_DAYS,
  PaymentMethod,
  formatINR,
} from "@lofticore/shared";
import { Button } from "@/components/ui/button";
import { Price, Skeleton } from "@/components/ui/bits";
import { cn } from "@/lib/cn";
import { useAuthStore } from "@/stores/auth.store";
import { selectCartTotal, useCartStore } from "@/stores/cart.store";
import { useAddresses } from "@/features/account/api";
import { AddressForm, AddressSummary } from "@/features/account/address-form";
import { useCheckout, usePaymentMethods } from "../api";

export function CheckoutPage() {
  const navigate = useNavigate();
  const { lines, clear } = useCartStore();
  const subtotal = useCartStore(selectCartTotal);
  const { data: addresses, isLoading } = useAddresses();
  const checkout = useCheckout();

  const [chosen, setChosen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.UPI);

  const addressId = chosen ?? addresses?.find((a) => a.isDefault)?.id ?? addresses?.[0]?.id ?? null;
  const deliveryFee = subtotal >= FREE_DELIVERY_ABOVE ? 0 : DELIVERY_FEE;
  const total = subtotal + deliveryFee;
  // brand-new accounts get a lower cash-on-delivery cap (the server enforces it too)
  const user = useAuthStore((s) => s.user);
  // asked once per visit, not on every render
  const [now] = useState(Date.now);
  const isNewAccount = user
    ? now - new Date(user.createdAt).getTime() < NEW_ACCOUNT_DAYS * 24 * 3600_000
    : false;
  const codLimit = isNewAccount ? NEW_ACCOUNT_COD_LIMIT : COD_LIMIT;
  const codAllowed = total <= codLimit;
  const { data: methods } = usePaymentMethods();

  // One key per distinct order. Changing anything about the order gets a new key,
  // while a double-click or a retry of the same order reuses it - so it can only
  // ever be placed once.
  const signature = lines.map((l) => `${l.sku}x${l.qty}`).join(",") + `|${addressId}|${method}`;
  const idempotencyKey = useMemo(() => crypto.randomUUID(), [signature]); // eslint-disable-line react-hooks/exhaustive-deps

  if (lines.length === 0 && !checkout.isSuccess) return <Navigate to="/cart" replace />;

  const place = () => {
    if (!addressId) return;
    checkout.mutate(
      {
        items: lines.map((l) => ({ productId: l.productId, sku: l.sku, qty: l.qty })),
        addressId,
        paymentMethod: method,
        idempotencyKey,
      },
      {
        onSuccess: (order) => {
          clear();
          navigate(
            method === PaymentMethod.COD ? `/orders/${order.id}?placed=1` : `/pay/${order.id}`,
            { replace: true },
          );
        },
      },
    );
  };

  const optionClass = (on: boolean, disabled = false) =>
    cn(
      "flex w-full items-start gap-3.5 rounded-2xl border p-4 text-left transition-colors",
      on ? "border-brand bg-brand-soft" : "border-line bg-white hover:border-brand/50",
      disabled && "cursor-not-allowed opacity-50 hover:border-line",
    );

  return (
    <div className="container-page py-10">
      <h1 className="text-3xl sm:text-4xl">Checkout</h1>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_380px]">
        <div className="space-y-10">
          <section aria-labelledby="addr-h">
            <h2 id="addr-h" className="mb-4 text-xl">
              1. Delivery address
            </h2>
            {isLoading ? (
              <Skeleton className="h-28" />
            ) : (
              <div className="space-y-3">
                {addresses?.map((a) => (
                  <label key={a.id} className={optionClass(addressId === a.id)}>
                    <input
                      type="radio"
                      name="address"
                      className="mt-1 accent-brand"
                      checked={addressId === a.id}
                      onChange={() => setChosen(a.id)}
                    />
                    <AddressSummary a={a} />
                  </label>
                ))}

                {adding || addresses?.length === 0 ? (
                  <div className="rounded-2xl border border-line bg-white p-5">
                    <h3 className="mb-4 font-sans text-base font-semibold">New address</h3>
                    <AddressForm
                      onSaved={(a) => {
                        setChosen(a.id);
                        setAdding(false);
                      }}
                      onCancel={addresses?.length ? () => setAdding(false) : undefined}
                    />
                  </div>
                ) : (
                  <Button variant="secondary" onClick={() => setAdding(true)}>
                    <Plus className="size-4" aria-hidden /> Add a new address
                  </Button>
                )}
              </div>
            )}
          </section>

          <section aria-labelledby="pay-h">
            <h2 id="pay-h" className="mb-4 text-xl">
              2. Payment
            </h2>
            <div className="space-y-3" role="radiogroup">
              <button
                type="button"
                role="radio"
                aria-checked={method === PaymentMethod.UPI}
                onClick={() => setMethod(PaymentMethod.UPI)}
                className={optionClass(method === PaymentMethod.UPI)}
              >
                <Smartphone className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
                <span>
                  <span className="block font-medium">Pay with UPI</span>
                  <span className="text-sm text-muted">
                    Pay instantly with any UPI app. Your order is confirmed the moment it goes
                    through.
                  </span>
                </span>
              </button>
              {methods?.razorpay && (
                <button
                  type="button"
                  role="radio"
                  aria-checked={method === PaymentMethod.RAZORPAY}
                  onClick={() => setMethod(PaymentMethod.RAZORPAY)}
                  className={optionClass(method === PaymentMethod.RAZORPAY)}
                >
                  <CreditCard className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
                  <span>
                    <span className="block font-medium">Card, UPI or net banking</span>
                    <span className="text-sm text-muted">
                      Secure checkout by Razorpay (test mode: no real money moves).
                    </span>
                  </span>
                </button>
              )}
              <button
                type="button"
                role="radio"
                aria-checked={method === PaymentMethod.COD}
                disabled={!codAllowed}
                onClick={() => setMethod(PaymentMethod.COD)}
                className={optionClass(method === PaymentMethod.COD, !codAllowed)}
              >
                <Banknote className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
                <span>
                  <span className="block font-medium">Cash on delivery</span>
                  <span className="text-sm text-muted">
                    {codAllowed
                      ? "Pay in cash when your order arrives."
                      : `Available for orders up to ${formatINR(codLimit)}${isNewAccount ? " on new accounts" : ""}. Please pay online for this one.`}
                  </span>
                </span>
              </button>
            </div>
          </section>
        </div>

        <aside className="h-fit rounded-2xl border border-line bg-white p-6 lg:sticky lg:top-32">
          <h2 className="text-xl">Order summary</h2>
          <ul className="mt-4 space-y-3">
            {lines.map((l) => (
              <li key={l.sku} className="flex gap-3 text-sm">
                <img src={l.image} alt="" className="size-14 rounded-lg object-cover" />
                <div className="flex-1">
                  <p className="line-clamp-2 font-medium leading-snug">{l.title}</p>
                  <p className="text-muted">Qty {l.qty}</p>
                </div>
                <span className="font-medium">{formatINR(l.price * l.qty)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-5 space-y-2.5 border-t border-line pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Items</dt>
              <dd>{formatINR(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Delivery</dt>
              <dd>{deliveryFee === 0 ? "Free" : formatINR(deliveryFee)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-3 text-base">
              <dt className="font-semibold">Total</dt>
              <dd>
                <Price price={total} size="lg" />
              </dd>
            </div>
          </dl>
          <Button
            size="lg"
            className="mt-6 w-full"
            onClick={place}
            loading={checkout.isPending}
            disabled={!addressId}
          >
            {method === PaymentMethod.COD ? "Place order" : "Continue to pay"}
          </Button>
          {!addressId && !isLoading && (
            <p className="mt-2 text-center text-xs text-muted">
              Add a delivery address to continue.
            </p>
          )}
          <p className="mt-4 text-center text-xs text-muted">
            Prices are confirmed again when you place the order.{" "}
            <Link to="/cart" className="underline">
              Edit cart
            </Link>
          </p>
        </aside>
      </div>
    </div>
  );
}
