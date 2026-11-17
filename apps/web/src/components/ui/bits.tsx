import type { ReactNode } from "react";
import { Star } from "lucide-react";
import { formatINR } from "@lofticore/shared";
import { cn } from "@/lib/cn";

export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn("animate-pulse rounded-xl bg-brand-soft", className)} aria-hidden />
);

export function Rating({
  value,
  count,
  className,
}: {
  value: number;
  count?: number;
  className?: string;
}) {
  if (!count) return <span className={cn("text-xs text-muted", className)}>No reviews yet</span>;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs text-muted", className)}>
      <Star className="size-3.5 fill-gold text-gold" aria-hidden />
      <span className="font-medium text-ink">{value.toFixed(1)}</span>
      <span>({count})</span>
      <span className="sr-only">rated {value.toFixed(1)} out of 5</span>
    </span>
  );
}

export function Price({
  price,
  mrp,
  size = "md",
}: {
  price: number;
  mrp?: number;
  size?: "md" | "lg";
}) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <span className={cn("font-semibold text-ink", size === "lg" ? "text-2xl" : "text-base")}>
        {formatINR(price)}
      </span>
      {mrp && mrp > price && (
        <span className={cn("text-muted line-through", size === "lg" ? "text-base" : "text-sm")}>
          {formatINR(mrp)}
        </span>
      )}
    </span>
  );
}

export const Badge = ({
  children,
  tone = "brand",
}: {
  children: ReactNode;
  tone?: "brand" | "gold" | "danger";
}) => (
  <span
    className={cn(
      "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
      tone === "brand" && "bg-brand text-white",
      tone === "gold" && "bg-gold text-ink",
      tone === "danger" && "bg-danger/10 text-danger",
    )}
  >
    {children}
  </span>
);

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-16 text-center">
      <h3 className="text-xl">{title}</h3>
      {children && <p className="mt-2 max-w-md text-sm text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Pagination({
  page,
  pages,
  onChange,
}: {
  page: number;
  pages: number;
  onChange: (page: number) => void;
}) {
  if (pages <= 1) return null;

  // 1 … 4 5 [6] 7 8 … 20
  const items: (number | "gap")[] = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 1) items.push(p);
    else if (items[items.length - 1] !== "gap") items.push("gap");
  }

  const base = "grid size-10 place-items-center rounded-full text-sm transition-colors";
  return (
    <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-1.5">
      <button
        className={cn(base, "hover:bg-brand-soft disabled:opacity-40")}
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label="Previous page"
      >
        ‹
      </button>
      {items.map((it, i) =>
        it === "gap" ? (
          <span key={`g${i}`} className="px-1 text-muted">
            …
          </span>
        ) : (
          <button
            key={it}
            onClick={() => onChange(it)}
            aria-current={it === page ? "page" : undefined}
            className={cn(base, it === page ? "bg-brand text-white" : "hover:bg-brand-soft")}
          >
            {it}
          </button>
        ),
      )}
      <button
        className={cn(base, "hover:bg-brand-soft disabled:opacity-40")}
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
        aria-label="Next page"
      >
        ›
      </button>
    </nav>
  );
}
