import { useState } from "react";
import { Link } from "react-router-dom";
import { REPORT_REASONS, type ReportDTO } from "@lofticore/shared";
import { Button } from "@/components/ui/button";
import { EmptyState, Pagination, Skeleton } from "@/components/ui/bits";
import { errorMessage } from "@/lib/query-client";
import { useAdminReports, useResolveReport } from "@/features/trust/api";
import { FilterTabs, PageHeader, Pill, when } from "../ui";

const TABS = [
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
];

function ReportCard({ r }: { r: ReportDTO }) {
  const resolve = useResolveReport();
  const [closing, setClosing] = useState<"resolved" | "dismissed" | null>(null);
  const [note, setNote] = useState("");
  const [action, setAction] = useState<"none" | "hide_review" | "suspend_product">("none");
  const [error, setError] = useState<string | null>(null);
  const open = r.status === "open";

  const submit = () => {
    if (!closing) return;
    setError(null);
    resolve.mutate(
      {
        id: r.id,
        status: closing,
        note: note.trim(),
        action: closing === "resolved" ? action : "none",
      },
      { onError: (e) => setError(errorMessage(e)) },
    );
  };

  return (
    <article className="rounded-2xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">
            {r.targetType} · {REPORT_REASONS[r.reason]}
          </p>
          <h2 className="mt-0.5 font-sans text-lg font-semibold">{r.targetLabel}</h2>
        </div>
        <div className="flex items-center gap-2">
          {(r.reportsOnTarget ?? 0) > 1 && (
            <Pill tone="red">{r.reportsOnTarget} reports on this</Pill>
          )}
          <Pill tone={open ? "amber" : r.status === "resolved" ? "green" : "grey"}>{r.status}</Pill>
        </div>
      </div>

      <p className="mt-3 rounded-xl bg-brand-soft/60 p-3 text-sm">{r.details}</p>
      <p className="mt-2 text-xs text-muted">
        Reported by {r.reporter?.name ?? "someone"} ({r.reporter?.email}) · {when(r.createdAt)}
        {r.targetType === "seller" && (
          <>
            {" "}
            ·{" "}
            <Link className="text-brand underline" to={`/admin/users/${r.targetId}`}>
              Open seller
            </Link>
          </>
        )}
      </p>
      {r.resolutionNote && <p className="mt-2 text-sm text-ink/80">Our note: {r.resolutionNote}</p>}

      {open && !closing && (
        <div className="mt-4 flex gap-2">
          <Button size="sm" onClick={() => setClosing("resolved")}>
            Take action…
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setClosing("dismissed")}>
            Dismiss…
          </Button>
        </div>
      )}

      {open && closing && (
        <div className="mt-4 space-y-3">
          <label htmlFor={`note-${r.id}`} className="block text-sm font-medium">
            Note to the reporter
          </label>
          <textarea
            id={`note-${r.id}`}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-xl border border-line p-3 text-sm outline-none focus:border-brand"
            autoFocus
          />
          {closing === "resolved" && (r.targetType === "review" || r.targetType === "product") && (
            <label className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-brand"
                checked={action !== "none"}
                onChange={(e) =>
                  setAction(
                    e.target.checked
                      ? r.targetType === "review"
                        ? "hide_review"
                        : "suspend_product"
                      : "none",
                  )
                }
              />
              {r.targetType === "review"
                ? "Also hide this review"
                : "Also pull this product off sale"}
            </label>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              loading={resolve.isPending}
              disabled={note.trim().length < 3}
              onClick={submit}
            >
              {closing === "resolved" ? "Close as resolved" : "Dismiss"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setClosing(null)}>
              Back
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}

export function AdminReportsPage() {
  const [status, setStatus] = useState("open");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAdminReports(status, page);

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Problems customers have raised. Oldest first, so nothing waits too long."
      />
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
          <Skeleton className="h-40" />
        ) : data?.items.length === 0 ? (
          <EmptyState title="Nothing here">
            When customers report a problem, it shows up in this queue.
          </EmptyState>
        ) : (
          data?.items.map((r) => <ReportCard key={r.id} r={r} />)
        )}
      </div>
      {data && <Pagination page={data.page} pages={data.pages} onChange={setPage} />}
    </div>
  );
}
