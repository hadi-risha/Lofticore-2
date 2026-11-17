import { EmptyState, Skeleton } from "@/components/ui/bits";
import { useDeliveryOrders } from "../api";
import { ApprovalBanner } from "../approval-banner";
import { ShipmentCard } from "../shipment-card";
import { PageHeader } from "../ui";

export function DeliveryPage() {
  const { data, isLoading } = useDeliveryOrders();

  return (
    <div>
      <PageHeader
        title="My deliveries"
        subtitle="Parcels assigned to you. At the door, ask the customer for their 4-digit code."
      />
      <ApprovalBanner />
      {isLoading ? (
        <Skeleton className="h-48" />
      ) : data?.length === 0 ? (
        <EmptyState title="Nothing assigned right now">
          When the team assigns you a parcel, it appears here.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {data?.flatMap((o) =>
            o.shipments.map((s) => (
              <ShipmentCard
                key={s.id}
                order={o}
                shipment={s}
                can={["out_for_delivery", "deliver"]}
                invalidate={["delivery"]}
              />
            )),
          )}
        </div>
      )}
    </div>
  );
}
