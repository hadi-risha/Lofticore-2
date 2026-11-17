import { useState } from "react";
import { OrderStatus } from "@lofticore/shared";
import { EmptyState, Pagination, Skeleton } from "@/components/ui/bits";
import { useAdminOrders, useAdminUsers, useAssignAgent } from "../api";
import { ShipmentCard } from "../shipment-card";
import { FilterTabs, PageHeader } from "../ui";

const TABS = [
  { value: "", label: "All" },
  { value: OrderStatus.PLACED, label: "Booked" },
  { value: OrderStatus.PROCESSING, label: "Being prepared" },
  { value: OrderStatus.SHIPPED, label: "On the way" },
  { value: OrderStatus.DELIVERED, label: "Delivered" },
  { value: OrderStatus.CANCELLED, label: "Cancelled" },
];

// Staff can see every parcel, assign the delivery partner, and step in when a
// seller or partner can't (for example after a block).
export function AdminOrdersPage() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAdminOrders(status || undefined, page);
  const { data: partners } = useAdminUsers({ role: "delivery", status: "active", page: 1 });
  const assign = useAssignAgent();

  return (
    <div>
      <PageHeader title="Orders" subtitle="Assign delivery partners and keep parcels moving." />
      <FilterTabs
        options={TABS}
        value={status}
        onChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
      />

      <div className="mt-5 space-y-4">
        {isLoading ? (
          <Skeleton className="h-48" />
        ) : data?.items.length === 0 ? (
          <EmptyState title="No orders here" />
        ) : (
          data?.items.flatMap((o) =>
            o.shipments.map((s) => (
              <ShipmentCard
                key={s.id}
                order={o}
                shipment={s}
                can={["confirm", "pack", "ship", "out_for_delivery"]}
                invalidate={["admin"]}
                extra={
                  s.status !== "cancelled" && s.status !== "delivered" ? (
                    <div className="mt-3 flex items-center gap-2 text-sm">
                      <label htmlFor={`agent-${s.id}`} className="text-muted">
                        Delivery partner
                      </label>
                      <select
                        id={`agent-${s.id}`}
                        defaultValue=""
                        onChange={(e) =>
                          e.target.value &&
                          assign.mutate({
                            orderId: o.id,
                            shipmentId: s.id,
                            agentId: e.target.value,
                          })
                        }
                        className="h-9 rounded-lg border border-line bg-white px-2.5 text-sm"
                      >
                        <option value="">Assign…</option>
                        {partners?.items.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null
                }
              />
            )),
          )
        )}
      </div>
      {data && <Pagination page={data.page} pages={data.pages} onChange={setPage} />}
    </div>
  );
}
