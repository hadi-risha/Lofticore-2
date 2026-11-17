import { useState } from "react";
import { Plus } from "lucide-react";
import type { AddressDTO } from "@lofticore/shared";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Skeleton } from "@/components/ui/bits";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAddresses, useDeleteAddress } from "../api";
import { AddressForm, AddressSummary } from "../address-form";

export function AddressesPage() {
  const { data: addresses, isLoading } = useAddresses();
  const del = useDeleteAddress();
  // "new" opens a blank form, an address opens it for editing
  const [editing, setEditing] = useState<AddressDTO | "new" | null>(null);
  const [removing, setRemoving] = useState<AddressDTO | null>(null);

  return (
    <div className="container-page max-w-3xl py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl sm:text-4xl">Your addresses</h1>
        {!editing && (
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" aria-hidden /> Add address
          </Button>
        )}
      </div>

      {editing && (
        <div className="mt-6 rounded-2xl border border-line bg-white p-5 sm:p-6">
          <h2 className="mb-4 text-xl">{editing === "new" ? "New address" : "Edit address"}</h2>
          <AddressForm
            address={editing === "new" ? undefined : editing}
            onSaved={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      <div className="mt-6 space-y-4">
        {isLoading && <Skeleton className="h-32" />}
        {addresses?.length === 0 && !editing && (
          <EmptyState
            title="No saved addresses"
            action={<Button onClick={() => setEditing("new")}>Add your first address</Button>}
          >
            Save an address once and checkout takes a few taps.
          </EmptyState>
        )}
        {addresses?.map((a) => (
          <div
            key={a.id}
            className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-line bg-white p-5"
          >
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {a.label}
                </span>
                {a.isDefault && <Badge>Default</Badge>}
              </div>
              <AddressSummary a={a} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setEditing(a)}>
                Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRemoving(a)}>
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={Boolean(removing)}
        title="Remove this address?"
        confirmLabel="Remove"
        danger
        loading={del.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={() =>
          removing && del.mutate(removing.id, { onSettled: () => setRemoving(null) })
        }
      >
        {removing?.line1}, {removing?.city}. Orders already placed to it aren&apos;t affected.
      </ConfirmDialog>
    </div>
  );
}
