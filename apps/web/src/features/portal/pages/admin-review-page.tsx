import { useState } from "react";
import { formatINR } from "@lofticore/shared";
import { Button } from "@/components/ui/button";
import { EmptyState, Pagination, Skeleton } from "@/components/ui/bits";
import { useReviewProduct, useReviewQueue, type ReviewRow } from "../api";
import { PageHeader, when } from "../ui";

function ReviewCard({ p }: { p: ReviewRow }) {
  const review = useReviewProduct();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");

  return (
    <article className="rounded-2xl border border-line bg-white p-5">
      <div className="flex gap-4">
        <img src={p.images[0]?.url} alt="" className="size-28 shrink-0 rounded-xl object-cover" />
        <div className="min-w-0 flex-1">
          <h2 className="font-sans text-lg font-semibold">{p.title}</h2>
          <p className="text-xs text-muted">
            {p.category.name} · {p.seller.name} ({p.seller.email}) · {when(p.updatedAt)}
          </p>
          <p className="mt-2 line-clamp-3 text-sm text-ink/80">{p.description}</p>
          <p className="mt-2 text-sm">
            {p.dimensions.widthCm}×{p.dimensions.depthCm}×{p.dimensions.heightCm} cm ·{" "}
            {p.variants
              .map((v) => `${v.sku} ${formatINR(v.price)} (${v.available} in stock)`)
              .join(" · ")}
          </p>
        </div>
      </div>
      {p.images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {p.images.slice(1).map((i) => (
            <img key={i.url} src={i.url} alt="" className="size-16 rounded-lg object-cover" />
          ))}
        </div>
      )}

      {rejecting ? (
        <div className="mt-4 space-y-3">
          <label htmlFor={`note-${p._id}`} className="block text-sm font-medium">
            What should the seller fix?
          </label>
          <textarea
            id={`note-${p._id}`}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-xl border border-line p-3 text-sm outline-none focus:border-brand"
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              variant="danger"
              size="sm"
              disabled={note.trim().length < 3}
              loading={review.isPending}
              onClick={() => review.mutate({ id: p._id, decision: "reject", note: note.trim() })}
            >
              Send back
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex gap-2">
          <Button
            size="sm"
            loading={review.isPending}
            onClick={() => review.mutate({ id: p._id, decision: "approve" })}
          >
            Approve
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setRejecting(true)}>
            Send back…
          </Button>
        </div>
      )}
    </article>
  );
}

export function AdminReviewPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useReviewQueue("pending_review", page);

  return (
    <div>
      <PageHeader
        title="Product review"
        subtitle="Check photos, sizes and prices before a product goes live."
      />
      {isLoading ? (
        <Skeleton className="h-48" />
      ) : data?.items.length === 0 ? (
        <EmptyState title="The queue is empty">New products from sellers appear here.</EmptyState>
      ) : (
        <div className="space-y-4">
          {data?.items.map((p) => (
            <ReviewCard key={p._id} p={p} />
          ))}
        </div>
      )}
      {data && <Pagination page={data.page} pages={data.pages} onChange={setPage} />}
    </div>
  );
}
