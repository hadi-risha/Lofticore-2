import type { ProductSummary } from "@lofticore/shared";
import { ProductGrid } from "@/features/catalog/components/product-card";

// A titled row of suggested products. Renders nothing when there's nothing to suggest,
// so a quiet shop never shows an empty heading.
export function ProductRail({
  title,
  subtitle,
  products,
  loading,
  max = 4,
}: {
  title: string;
  subtitle?: string;
  products?: ProductSummary[];
  loading?: boolean;
  max?: number;
}) {
  if (!loading && (!products || products.length === 0)) return null;
  return (
    <section className="mt-16" aria-label={title}>
      <h2 className="text-2xl sm:text-3xl">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      <div className="mt-6">
        <ProductGrid products={products?.slice(0, max)} loading={loading} count={max} />
      </div>
    </section>
  );
}
