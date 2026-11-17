import { Link, useNavigate } from "react-router-dom";
import { Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatINR } from "@lofticore/shared";
import { Button } from "@/components/ui/button";
import { EmptyState, Price } from "@/components/ui/bits";
import { selectCartCount, selectCartTotal, useCartStore } from "@/stores/cart.store";
import { ProductRail } from "@/features/trust/product-rail";
import { useBoughtTogether } from "@/features/trust/api";

const FREE_DELIVERY_ABOVE = 10_000_00; // paise

export function CartPage() {
  const navigate = useNavigate();
  const { lines, setQty, remove } = useCartStore();
  const total = useCartStore(selectCartTotal);
  const count = useCartStore(selectCartCount);
  const { data: suggestions } = useBoughtTogether(
    lines.map((l) => l.productId),
    8,
  );

  if (lines.length === 0) {
    return (
      <div className="container-page py-16">
        <EmptyState
          title="Your cart is empty"
          action={
            <Link to="/shop">
              <Button>Start shopping</Button>
            </Link>
          }
        >
          Pieces you add will wait for you here.
        </EmptyState>
      </div>
    );
  }

  const remaining = FREE_DELIVERY_ABOVE - total;

  return (
    <div className="container-page py-10">
      <h1 className="text-3xl sm:text-4xl">Your cart</h1>
      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_360px]">
        <ul className="divide-y divide-line">
          {lines.map((l) => (
            <li key={l.sku} className="flex gap-4 py-5 first:pt-0">
              <Link
                to={`/product/${l.slug}`}
                className="size-24 shrink-0 overflow-hidden rounded-xl bg-brand-soft sm:size-28"
              >
                <img src={l.image} alt="" className="size-full object-cover" />
              </Link>
              <div className="flex flex-1 flex-col">
                <div className="flex justify-between gap-3">
                  <div>
                    <Link to={`/product/${l.slug}`} className="font-medium hover:text-brand">
                      {l.title}
                    </Link>
                    {l.variantLabel && <p className="text-sm text-muted">{l.variantLabel}</p>}
                  </div>
                  <p className="font-semibold">{formatINR(l.price * l.qty)}</p>
                </div>
                <div className="mt-auto flex items-center justify-between pt-3">
                  <div className="flex h-9 items-center rounded-full border border-line bg-white">
                    <button
                      className="grid size-9 place-items-center disabled:opacity-40"
                      onClick={() => setQty(l.sku, l.qty - 1)}
                      disabled={l.qty <= 1}
                      aria-label={`Decrease quantity of ${l.title}`}
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <span className="w-6 text-center text-sm">{l.qty}</span>
                    <button
                      className="grid size-9 place-items-center disabled:opacity-40"
                      onClick={() => setQty(l.sku, l.qty + 1)}
                      disabled={l.qty >= 10}
                      aria-label={`Increase quantity of ${l.title}`}
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      remove(l.sku);
                      toast(`Removed ${l.title}`, {
                        action: {
                          label: "Undo",
                          onClick: () => useCartStore.getState().add({ ...l }, l.qty),
                        },
                      });
                    }}
                    className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-danger"
                  >
                    <Trash2 className="size-4" aria-hidden /> Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <aside className="h-fit rounded-2xl border border-line bg-white p-6">
          <h2 className="text-xl">Order summary</h2>
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Items ({count})</dt>
              <dd>
                <Price price={total} />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Delivery</dt>
              <dd>{remaining <= 0 ? "Free" : "Calculated at checkout"}</dd>
            </div>
          </dl>
          {remaining > 0 && (
            <p className="mt-4 rounded-xl bg-brand-soft px-3.5 py-2.5 text-xs">
              Add <strong>{formatINR(remaining)}</strong> more for free delivery.
            </p>
          )}
          <Button size="lg" className="mt-6 w-full" onClick={() => navigate("/checkout")}>
            Checkout
          </Button>
        </aside>
      </div>

      <ProductRail
        title="Goes well with your cart"
        products={suggestions?.filter((p) => !lines.some((l) => l.productId === p.id))}
      />
    </div>
  );
}
