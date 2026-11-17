import { Link } from "react-router-dom";
import { formatINR } from "@lofticore/shared";
import { Skeleton } from "@/components/ui/bits";
import { useAdminStats } from "../api";
import { PageHeader, StatCard } from "../ui";

export function AdminDashboardPage() {
  const { data, isLoading } = useAdminStats();
  if (isLoading || !data) return <Skeleton className="h-64" />;

  const todo =
    data.pendingSellers + data.pendingDelivery + data.productsAwaitingReview + data.openReports;

  return (
    <div>
      <PageHeader
        title="Overview"
        subtitle={
          todo
            ? `${todo} thing${todo === 1 ? "" : "s"} waiting for your review.`
            : "Nothing is waiting for you."
        }
      />

      <h2 className="mb-3 text-lg">Needs attention</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link to="/admin/users?role=seller&status=pending_approval">
          <StatCard
            label="Sellers to verify"
            value={data.pendingSellers}
            tone={data.pendingSellers ? "warn" : undefined}
          />
        </Link>
        <Link to="/admin/users?role=delivery&status=pending_approval">
          <StatCard
            label="Delivery partners to verify"
            value={data.pendingDelivery}
            tone={data.pendingDelivery ? "warn" : undefined}
          />
        </Link>
        <Link to="/admin/products">
          <StatCard
            label="Products to review"
            value={data.productsAwaitingReview}
            tone={data.productsAwaitingReview ? "warn" : undefined}
          />
        </Link>
        <Link to="/admin/reports">
          <StatCard
            label="Open reports"
            value={data.openReports}
            tone={data.openReports ? "warn" : undefined}
          />
        </Link>
      </div>

      <h2 className="mb-3 mt-10 text-lg">The marketplace</h2>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Sales" value={formatINR(data.revenue)} hint="Orders not cancelled" />
        <StatCard label="Orders" value={data.orders.total} hint={`${data.orders.today} today`} />
        <StatCard label="In progress" value={data.orders.open} />
        <StatCard
          label="Customers"
          value={data.users.customer ?? 0}
          hint={`${data.users.seller ?? 0} sellers · ${data.users.delivery ?? 0} delivery`}
        />
      </div>
    </div>
  );
}
