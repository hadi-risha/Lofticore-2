import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { formatINR } from "@lofticore/shared";
import { Button } from "@/components/ui/button";
import { EmptyState, Pagination, Skeleton } from "@/components/ui/bits";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useProductAction, useSellerProducts, type SellerProductRow } from "../api";
import { ApprovalBanner } from "../approval-banner";
import { FilterTabs, PageHeader, Pill, Table, Td, prettyStatus, statusTone } from "../ui";

const TABS = [
  { value: "", label: "All" },
  { value: "active", label: "Live" },
  { value: "pending_review", label: "In review" },
  { value: "draft", label: "Drafts" },
  { value: "rejected", label: "Sent back" },
  { value: "suspended", label: "Suspended" },
  { value: "archived", label: "Archived" },
];

export function SellerProductsPage() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [archiving, setArchiving] = useState<SellerProductRow | null>(null);
  const { data, isLoading } = useSellerProducts(status || undefined, page);
  const act = useProductAction();

  return (
    <div>
      <PageHeader
        title="Your products"
        actions={
          <Link to="/seller/products/new">
            <Button>
              <Plus className="size-4" aria-hidden /> Add a product
            </Button>
          </Link>
        }
      />
      <ApprovalBanner />

      <FilterTabs
        options={TABS}
        value={status}
        onChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
      />

      <div className="mt-5">
        {isLoading ? (
          <Skeleton className="h-64" />
        ) : data?.items.length === 0 ? (
          <EmptyState
            title="Nothing here yet"
            action={
              <Link to="/seller/products/new">
                <Button>Add your first product</Button>
              </Link>
            }
          >
            New products are checked by our team before they go live.
          </EmptyState>
        ) : (
          <Table head={["Product", "Status", "Price", "In stock", ""]}>
            {data?.items.map((p) => {
              const prices = p.variants.map((v) => v.price);
              const stock = p.variants.reduce((n, v) => n + v.available, 0);
              return (
                <tr key={p._id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <img
                        src={p.images[0]?.url}
                        alt=""
                        className="size-12 rounded-lg object-cover"
                      />
                      <div>
                        <p className="font-medium">{p.title}</p>
                        <p className="text-xs text-muted">{p.category.name}</p>
                        {p.status === "rejected" && p.reviewNote && (
                          <p className="mt-1 text-xs text-danger">Feedback: {p.reviewNote}</p>
                        )}
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <Pill tone={statusTone(p.status)}>
                      {p.status === "pending_review"
                        ? "In review"
                        : p.status === "rejected"
                          ? "Sent back"
                          : prettyStatus(p.status)}
                    </Pill>
                  </Td>
                  <Td>
                    {Math.min(...prices) === Math.max(...prices)
                      ? formatINR(prices[0]!)
                      : `${formatINR(Math.min(...prices))}+`}
                  </Td>
                  <Td className={stock === 0 ? "font-semibold text-danger" : ""}>{stock}</Td>
                  <Td>
                    <div className="flex flex-wrap justify-end gap-2">
                      {(p.status === "draft" || p.status === "rejected") && (
                        <Button
                          size="sm"
                          onClick={() => act.mutate({ id: p._id, action: "submit" })}
                          loading={act.isPending && act.variables?.id === p._id}
                        >
                          Send for review
                        </Button>
                      )}
                      <Link to={`/seller/products/${p._id}`}>
                        <Button size="sm" variant="secondary">
                          Edit
                        </Button>
                      </Link>
                      {p.status !== "archived" && (
                        <Button size="sm" variant="ghost" onClick={() => setArchiving(p)}>
                          Archive
                        </Button>
                      )}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </div>

      {data && <Pagination page={data.page} pages={data.pages} onChange={setPage} />}

      <ConfirmDialog
        open={Boolean(archiving)}
        title="Archive this product?"
        confirmLabel="Archive"
        danger
        loading={act.isPending}
        onClose={() => setArchiving(null)}
        onConfirm={() =>
          archiving &&
          act.mutate(
            { id: archiving._id, action: "archive" },
            { onSettled: () => setArchiving(null) },
          )
        }
      >
        &ldquo;{archiving?.title}&rdquo; will disappear from the shop. Existing orders aren&apos;t
        affected.
      </ConfirmDialog>
    </div>
  );
}
