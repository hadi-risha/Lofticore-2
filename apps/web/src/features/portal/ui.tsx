import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "warn";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-white p-5",
        tone === "warn" ? "border-gold bg-gold/10" : "border-line",
      )}
    >
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 font-display text-3xl">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function FilterTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
            o.value === value
              ? "border-brand bg-brand text-white"
              : "border-line bg-white hover:border-brand/50",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// A plain table that scrolls sideways on small screens rather than breaking the layout.
export function Table({
  head,
  children,
  empty,
}: {
  head: string[];
  children: ReactNode;
  empty?: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-line bg-brand-soft/60 text-xs uppercase tracking-wide text-muted">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

export const Td = ({ children, className }: { children: ReactNode; className?: string }) => (
  <td className={cn("px-4 py-3 align-middle", className)}>{children}</td>
);

const tones = {
  green: "bg-success/15 text-success",
  amber: "bg-gold/25 text-bronze",
  red: "bg-danger/10 text-danger",
  grey: "bg-brand-soft text-brand",
};

export const Pill = ({
  tone = "grey",
  children,
}: {
  tone?: keyof typeof tones;
  children: ReactNode;
}) => (
  <span
    className={cn(
      "inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold",
      tones[tone],
    )}
  >
    {children}
  </span>
);

export const statusTone = (s: string): keyof typeof tones =>
  ["active", "approved", "delivered", "paid"].includes(s)
    ? "green"
    : ["pending_approval", "pending_review", "draft", "placed", "processing", "shipped"].includes(s)
      ? "amber"
      : ["blocked", "rejected", "cancelled", "suspended", "failed"].includes(s)
        ? "red"
        : "grey";

export const prettyStatus = (s: string) =>
  s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
