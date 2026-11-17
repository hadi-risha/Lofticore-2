import { Link } from "react-router-dom";
import { AccountStatus, formatINR } from "@lofticore/shared";
import { Skeleton } from "@/components/ui/bits";
import { useAuthStore } from "@/stores/auth.store";
import { useSellerStats } from "../api";
import { ApprovalBanner } from "../approval-banner";
import { PageHeader, StatCard } from "../ui";

export function SellerDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { data, isLoading } = useSellerStats();
  const active = user?.status === AccountStatus.ACTIVE;

  const toShip =
    (data?.orders.placed ?? 0) + (data?.orders.confirmed ?? 0) + (data?.orders.packed ?? 0);

  return (
    <div>
      <PageHeader
        title={`Hello, ${user?.name.split(" ")[0]}`}
        subtitle="Here's how your shop is doing."
      />
      <ApprovalBanner />

      {isLoading ? (
        <Skeleton className="h-28" />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Sales so far" value={formatINR(data?.revenue ?? 0)} />
          <StatCard
            label="To pack or ship"
            value={toShip}
            tone={toShip > 0 ? "warn" : undefined}
            hint={toShip ? "Waiting on you" : "All caught up"}
          />
          <StatCard label="Live products" value={data?.products.active ?? 0} />
          <StatCard label="Waiting for review" value={data?.products.pending_review ?? 0} />
        </div>
      )}

      {active && (data?.lowStock.length ?? 0) > 0 && (
        <section className="mt-8 rounded-2xl border border-line bg-white p-5">
          <h2 className="text-lg">Running low</h2>
          <ul className="mt-3 divide-y divide-line text-sm">
            {data!.lowStock.map((l) => (
              <li key={l.sku} className="flex items-center justify-between py-2.5">
                <span>
                  {l.title} <span className="text-muted">({l.sku})</span>
                </span>
                <Link
                  to={`/seller/products/${l.productId}`}
                  className={
                    l.available === 0 ? "font-semibold text-danger" : "font-medium text-bronze"
                  }
                >
                  {l.available === 0 ? "Out of stock" : `${l.available} left`} · restock
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {active && (data?.products.draft ?? 0) + (data?.products.rejected ?? 0) > 0 && (
        <p className="mt-6 text-sm text-muted">
          You have products that aren&apos;t live yet.{" "}
          <Link to="/seller/products" className="font-medium text-brand underline">
            Review them
          </Link>
          .
        </p>
      )}
    </div>
  );
}
