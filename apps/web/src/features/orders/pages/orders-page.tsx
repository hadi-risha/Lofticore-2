import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { EmptyState, Pagination, Skeleton } from "@/components/ui/bits";
import { formatINR } from "@lofticore/shared";
import { useOrders } from "../api";
import { OrderStatusBadge, PaymentStatusBadge, orderDate } from "../status";

export function OrdersPage() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page")) || 1;
  const { data, isLoading } = useOrders(page);

  return (
    <div className="container-page max-w-4xl py-10">
      <h1 className="text-3xl sm:text-4xl">Your orders</h1>

      <div className="mt-8 space-y-4">
        {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-36" />)}

        {data?.items.length === 0 && (
          <EmptyState
            title="No orders yet"
            action={
              <Link to="/shop">
                <Button>Start shopping</Button>
              </Link>
            }
          >
            When you place an order, you can follow it here from booking to delivery.
          </EmptyState>
        )}

        {data?.items.map((o) => {
          const items = o.shipments.flatMap((s) => s.items);
          return (
            <Link
              key={o.id}
              to={`/orders/${o.id}`}
              className="block rounded-2xl border border-line bg-white p-5 transition-shadow hover:shadow-md"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{o.orderNumber}</p>
                  <p className="text-xs text-muted">Placed on {orderDate(o)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <OrderStatusBadge status={o.status} />
                  {o.payment && <PaymentStatusBadge payment={o.payment} />}
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between gap-4">
                <div className="flex -space-x-3">
                  {items.slice(0, 4).map((i) => (
                    <img
                      key={i.sku}
                      src={i.image}
                      alt=""
                      className="size-14 rounded-xl border-2 border-white object-cover"
                    />
                  ))}
                  {items.length > 4 && (
                    <span className="grid size-14 place-items-center rounded-xl border-2 border-white bg-brand-soft text-xs font-medium">
                      +{items.length - 4}
                    </span>
                  )}
                </div>
                <p className="font-semibold">{formatINR(o.total)}</p>
              </div>
            </Link>
          );
        })}
      </div>

      {data && (
        <Pagination
          page={data.page}
          pages={data.pages}
          onChange={(p) => setParams(p > 1 ? { page: String(p) } : {})}
        />
      )}
    </div>
  );
}
