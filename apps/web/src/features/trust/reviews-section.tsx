import { useState } from "react";
import { Link } from "react-router-dom";
import { Star, ThumbsUp } from "lucide-react";
import { reviewSchema, type ReviewDTO } from "@lofticore/shared";
import { Button } from "@/components/ui/button";
import { Pagination, Skeleton } from "@/components/ui/bits";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/query-client";
import { useAuthStore } from "@/stores/auth.store";
import {
  useDeleteReview,
  useReviewEligibility,
  useReviews,
  useSaveReview,
  useVoteHelpful,
} from "./api";
import { ReportButton } from "./report-dialog";

function Stars({ value, size = "size-4" }: { value: number; size?: string }) {
  return (
    <span className="inline-flex" aria-label={`${value} out of 5 stars`} role="img">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(size, i <= Math.round(value) ? "fill-gold text-gold" : "text-line")}
          aria-hidden
        />
      ))}
    </span>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div
      role="radiogroup"
      aria-label="Your rating"
      className="flex gap-1"
      onMouseLeave={() => setHover(0)}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={`${i} star${i > 1 ? "s" : ""}`}
          onMouseEnter={() => setHover(i)}
          onClick={() => onChange(i)}
          className="p-0.5"
        >
          <Star
            className={cn(
              "size-8 transition-colors",
              i <= (hover || value) ? "fill-gold text-gold" : "text-line",
            )}
            aria-hidden
          />
        </button>
      ))}
    </div>
  );
}

function ReviewForm({
  slug,
  existing,
  onDone,
}: {
  slug: string;
  existing?: ReviewDTO;
  onDone: () => void;
}) {
  const save = useSaveReview(slug, existing?.id);
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = () => {
    const parsed = reviewSchema.safeParse({ rating, title, body });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    save.mutate(parsed.data, {
      onSuccess: onDone,
      onError: (e) =>
        setErrors(e instanceof ApiError && e.fields ? e.fields : { _: errorMessage(e) }),
    });
  };

  return (
    <form
      className="rounded-2xl border border-line bg-white p-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h3 className="font-sans text-base font-semibold">
        {existing ? "Edit your review" : "Share your thoughts"}
      </h3>
      <div className="mt-3">
        <StarPicker value={rating} onChange={setRating} />
        {errors.rating && <p className="mt-1 text-xs text-danger">{errors.rating}</p>}
      </div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="A headline (optional)"
        maxLength={80}
        aria-label="Review headline"
        className="mt-4 h-11 w-full rounded-xl border border-line px-3.5 text-sm outline-none focus:border-brand"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        placeholder="What did you like or dislike? How does it look in your space?"
        aria-label="Your review"
        className="mt-3 w-full rounded-xl border border-line p-3.5 text-sm outline-none focus:border-brand"
      />
      {errors.body && <p className="mt-1 text-xs text-danger">{errors.body}</p>}
      {errors._ && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {errors._}
        </p>
      )}
      <div className="mt-4 flex gap-3">
        <Button type="submit" loading={save.isPending}>
          {existing ? "Save changes" : "Post review"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function ReviewsSection({ slug, productTitle }: { slug: string; productTitle: string }) {
  const user = useAuthStore((s) => s.user);
  const [sort, setSort] = useState("helpful");
  const [page, setPage] = useState(1);
  const [writing, setWriting] = useState(false);
  const [deleting, setDeleting] = useState<ReviewDTO | null>(null);
  const { data, isLoading } = useReviews(slug, sort, page);
  const { data: eligibility } = useReviewEligibility(slug);
  const vote = useVoteHelpful(slug);
  const del = useDeleteReview(slug);

  const summary = data?.summary;
  const mine = eligibility?.myReview;

  return (
    <section aria-labelledby="reviews-h" className="mt-20 border-t border-line pt-12">
      <h2 id="reviews-h" className="text-2xl sm:text-3xl">
        Customer reviews
      </h2>

      {isLoading || !summary ? (
        <Skeleton className="mt-6 h-40" />
      ) : (
        <div className="mt-6 grid gap-10 lg:grid-cols-[280px_1fr]">
          <div>
            {summary.count === 0 ? (
              <p className="text-muted">No reviews yet. Be the first to share what you think.</p>
            ) : (
              <>
                <p className="flex items-end gap-3">
                  <span className="font-display text-5xl">{summary.average.toFixed(1)}</span>
                  <span className="pb-1.5">
                    <Stars value={summary.average} size="size-5" />
                    <span className="block text-xs text-muted">
                      {summary.count} review{summary.count === 1 ? "" : "s"}
                    </span>
                  </span>
                </p>
                <ul className="mt-5 space-y-1.5 text-sm" aria-label="Rating breakdown">
                  {([5, 4, 3, 2, 1] as const).map((s) => (
                    <li key={s} className="flex items-center gap-2.5">
                      <span className="w-3 text-muted">{s}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-brand-soft">
                        <span
                          className="block h-full rounded-full bg-gold"
                          style={{ width: `${(summary.distribution[s] / summary.count) * 100}%` }}
                        />
                      </span>
                      <span className="w-6 text-right text-xs text-muted">
                        {summary.distribution[s]}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div className="mt-6">
              {!user ? (
                <p className="text-sm text-muted">
                  <Link
                    to="/login"
                    state={{ from: `/product/${slug}` }}
                    className="font-medium text-brand underline"
                  >
                    Sign in
                  </Link>{" "}
                  to review products you've bought.
                </p>
              ) : eligibility?.eligible && !eligibility.alreadyReviewed && !writing ? (
                <Button onClick={() => setWriting(true)}>Write a review</Button>
              ) : eligibility && !eligibility.eligible ? (
                <p className="text-sm text-muted">
                  You can review this once it has been delivered to you.
                </p>
              ) : null}
            </div>
          </div>

          <div>
            {writing && (
              <div className="mb-6">
                <ReviewForm slug={slug} existing={mine} onDone={() => setWriting(false)} />
              </div>
            )}

            {summary.count > 0 && (
              <div className="mb-4 flex items-center justify-end gap-2 text-sm">
                <label htmlFor="review-sort" className="text-muted">
                  Sort by
                </label>
                <select
                  id="review-sort"
                  value={sort}
                  onChange={(e) => {
                    setSort(e.target.value);
                    setPage(1);
                  }}
                  className="h-9 rounded-full border border-line bg-white px-3 text-sm"
                >
                  <option value="helpful">Most helpful</option>
                  <option value="newest">Newest</option>
                  <option value="highest">Highest rated</option>
                  <option value="lowest">Lowest rated</option>
                </select>
              </div>
            )}

            <ul className="divide-y divide-line">
              {data?.items.map((r) => (
                <li key={r.id} className="py-5 first:pt-0">
                  <div className="flex items-center gap-3">
                    <Stars value={r.rating} />
                    {r.title && <span className="font-medium">{r.title}</span>}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {r.author} · Verified purchase ·{" "}
                    {new Date(r.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-ink/90">{r.body}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
                    {!r.mine && user && (
                      <button
                        onClick={() => vote.mutate(r.id)}
                        aria-pressed={r.helpfulByMe}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5",
                          r.helpfulByMe
                            ? "border-brand bg-brand-soft text-brand"
                            : "border-line hover:border-brand",
                        )}
                      >
                        <ThumbsUp className="size-3.5" aria-hidden /> Helpful
                        {r.helpfulCount > 0 && ` (${r.helpfulCount})`}
                      </button>
                    )}
                    {r.mine ? (
                      <>
                        <button
                          className="text-brand hover:underline"
                          onClick={() => setWriting(true)}
                        >
                          Edit
                        </button>
                        <button
                          className="text-muted hover:text-danger"
                          onClick={() => setDeleting(r)}
                        >
                          Delete
                        </button>
                      </>
                    ) : user ? (
                      <ReportButton
                        targetType="review"
                        targetId={r.id}
                        label={`A review of ${productTitle}`}
                        reasons={["abusive", "scam", "other"]}
                      />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            {data && <Pagination page={data.page} pages={data.pages} onChange={setPage} />}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete your review?"
        confirmLabel="Delete"
        danger
        loading={del.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() =>
          deleting && del.mutate(deleting.id, { onSettled: () => setDeleting(null) })
        }
      >
        This can&apos;t be undone.
      </ConfirmDialog>
    </section>
  );
}
