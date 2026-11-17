import { useEffect, useState } from "react";
import { Flag } from "lucide-react";
import { REPORT_REASONS, type ReportReason, type ReportTarget } from "@lofticore/shared";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/query-client";
import { useSendReport } from "./api";

interface Props {
  open: boolean;
  onClose: () => void;
  targetType: ReportTarget;
  targetId: string;
  // what the person is reporting, in words ("Oak Chair", "Order LC-2026...")
  label: string;
  // which reasons make sense here
  reasons?: ReportReason[];
}

// One reporting form for everything: products, sellers, orders and reviews.
export function ReportDialog({ open, onClose, targetType, targetId, label, reasons }: Props) {
  const send = useSendReport();
  const options = (reasons ?? (Object.keys(REPORT_REASONS) as ReportReason[])).map((r) => ({
    value: r,
    label: REPORT_REASONS[r],
  }));
  const [reason, setReason] = useState<ReportReason>(options[0]!.value);
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = () => {
    setError(null);
    send.mutate(
      { targetType, targetId, reason, details },
      {
        onSuccess: () => {
          setDetails("");
          onClose();
        },
        onError: (e) => setError(errorMessage(e)),
      },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-title"
    >
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={onClose} />
      <form
        className="relative w-full max-w-md rounded-2xl bg-cream p-6 shadow-2xl"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h2 id="report-title" className="text-xl">
          Report a problem
        </h2>
        <p className="mt-1 text-sm text-muted">About: {label}</p>

        <label htmlFor="report-reason" className="mt-5 block text-sm font-medium">
          What went wrong?
        </label>
        <select
          id="report-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value as ReportReason)}
          className="mt-1.5 h-11 w-full rounded-xl border border-line bg-white px-3 text-sm"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <label htmlFor="report-details" className="mt-4 block text-sm font-medium">
          Tell us what happened
        </label>
        <textarea
          id="report-details"
          rows={4}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-line bg-white p-3 text-sm outline-none focus:border-brand"
        />

        {error && (
          <p
            role="alert"
            className="mt-3 rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger"
          >
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={send.isPending} disabled={details.trim().length < 10}>
            Send report
          </Button>
        </div>
      </form>
    </div>
  );
}

// A small "Report" link that opens the dialog.
export function ReportButton(
  props: Omit<Props, "open" | "onClose"> & { className?: string; children?: React.ReactNode },
) {
  const [open, setOpen] = useState(false);
  const { className, children, ...rest } = props;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ?? "inline-flex items-center gap-1.5 text-xs text-muted hover:text-danger"
        }
      >
        <Flag className="size-3.5" aria-hidden />
        {children ?? "Report"}
      </button>
      <ReportDialog {...rest} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
