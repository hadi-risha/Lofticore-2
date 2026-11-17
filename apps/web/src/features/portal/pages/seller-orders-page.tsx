import { useState } from "react";
import { Pagination, EmptyState, Skeleton } from "@/components/ui/bits";
import { useSellerOrders } from "../api";
import { ApprovalBanner } from "../approval-banner";
import { ShipmentCard } from "../shipment-card";
import { PageHeader } from "../ui";

export function SellerOrdersPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useSellerOrders(page);

  return (
    <div>
      <PageHeader
        title="Orders"
        subtitle="Confirm, pack and hand over each parcel. A delivery partner takes it from there."
      />
      <ApprovalBanner />
      {isLoading ? (
        <Skeleton className="h-48" />
      ) : data?.items.length === 0 ? (
        <EmptyState title="No orders yet">
          When customers buy your products, their orders show up here.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {data?.items.flatMap((o) =>
            o.shipments.map((s) => (
              <ShipmentCard
                key={s.id}
                order={o}
                shipment={s}
                can={["confirm", "pack", "ship"]}
                invalidate={["seller"]}
              />
            )),
          )}
        </div>
      )}
      {data && <Pagination page={data.page} pages={data.pages} onChange={setPage} />}
    </div>
  );
}
