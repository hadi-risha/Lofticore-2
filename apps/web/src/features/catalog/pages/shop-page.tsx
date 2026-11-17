import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { SlidersHorizontal, X } from "lucide-react";
import { ProductSort, type CategoryNode } from "@lofticore/shared";
import { Button } from "@/components/ui/button";
import { EmptyState, Pagination } from "@/components/ui/bits";
import { ApiError } from "@/lib/api";
import { NotFoundPage } from "@/pages/not-found";
import { useCategories, useProducts } from "../api";
import { FilterPanel } from "../components/filter-panel";
import { ProductGrid } from "../components/product-card";
import { splitList, useShopFilters } from "../filters";

const SORTS: { value: string; label: string }[] = [
  { value: ProductSort.RELEVANCE, label: "Best match" },
  { value: ProductSort.POPULAR, label: "Most popular" },
  { value: ProductSort.NEWEST, label: "Newest" },
  { value: ProductSort.PRICE_ASC, label: "Price: low to high" },
  { value: ProductSort.PRICE_DESC, label: "Price: high to low" },
  { value: ProductSort.RATING, label: "Top rated" },
];

const LIMIT = 24;

function findCategory(nodes: CategoryNode[], slug?: string): CategoryNode | undefined {
  for (const n of nodes) {
    if (n.slug === slug) return n;
    const inChild = findCategory(n.children, slug);
    if (inChild) return inChild;
  }
}

export function ShopPage() {
  const { categorySlug } = useParams();
  const { filters, update, clearAll, activeCount } = useShopFilters(categorySlug);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { data: categories = [] } = useCategories();
  const { data, isLoading, isFetching, error, refetch } = useProducts({ ...filters, limit: LIMIT });
  const category = findCategory(categories, categorySlug);

  // a category URL that doesn't exist is a 404, not an empty shop
  if (categorySlug && categories.length > 0 && !category) return <NotFoundPage />;

  const title = filters.q ? `Results for "${filters.q}"` : (category?.name ?? "All products");
  const panel = (
    <FilterPanel
      filters={filters}
      facets={data?.facets}
      categories={categories}
      activeCategory={categorySlug}
      update={update}
      clearAll={clearAll}
      activeCount={activeCount}
    />
  );

  // chips for what's currently filtered, each removable
  const chips: { label: string; clear: () => void }[] = [
    ...(filters.minPrice || filters.maxPrice
      ? [
          {
            label: `₹${filters.minPrice ? Number(filters.minPrice) / 100 : 0} – ${filters.maxPrice ? "₹" + Number(filters.maxPrice) / 100 : "any"}`,
            clear: () => update({ minPrice: undefined, maxPrice: undefined }),
          },
        ]
      : []),
    ...splitList(filters.material).map((m) => ({
      label: m,
      clear: () =>
        update({
          material: splitList(filters.material)
            .filter((x) => x !== m)
            .join(","),
        }),
    })),
    ...splitList(filters.color).map((c) => ({
      label: c,
      clear: () =>
        update({
          color: splitList(filters.color)
            .filter((x) => x !== c)
            .join(","),
        }),
    })),
    ...(filters.rating
      ? [{ label: `${filters.rating}★ & up`, clear: () => update({ rating: undefined }) }]
      : []),
    ...(filters.inStock
      ? [{ label: "In stock", clear: () => update({ inStock: undefined }) }]
      : []),
  ];

  const notFound = error instanceof ApiError && error.status === 404;

  return (
    <div className="container-page py-8">
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted">
        <Link to="/" className="hover:text-brand">
          Home
        </Link>{" "}
        /{" "}
        <Link to="/shop" className="hover:text-brand">
          Shop
        </Link>
        {category && (
          <>
            {" "}
            / <span className="text-ink">{category.name}</span>
          </>
        )}
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl">{title}</h1>
          {data && (
            <p className="mt-1 text-sm text-muted">
              {data.total} {data.total === 1 ? "product" : "products"}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="lg:hidden"
            onClick={() => setFiltersOpen(true)}
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            Filters{activeCount > 0 && ` (${activeCount})`}
          </Button>
          <label className="flex items-center gap-2 text-sm">
            <span className="sr-only sm:not-sr-only text-muted">Sort by</span>
            <select
              value={filters.sort ?? ProductSort.RELEVANCE}
              onChange={(e) =>
                update({
                  sort: e.target.value === ProductSort.RELEVANCE ? undefined : e.target.value,
                })
              }
              className="h-9 rounded-full border border-line bg-white px-3 text-sm outline-none focus:border-brand"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <button
              key={c.label}
              onClick={c.clear}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1.5 text-xs font-medium hover:bg-brand/15"
              aria-label={`Remove filter ${c.label}`}
            >
              {c.label} <X className="size-3" aria-hidden />
            </button>
          ))}
          <button onClick={clearAll} className="text-xs text-muted underline hover:text-brand">
            Clear all
          </button>
        </div>
      )}

      <div className="mt-8 grid gap-10 lg:grid-cols-[250px_1fr]">
        <aside className="hidden lg:block" aria-label="Filters">
          {panel}
        </aside>

        <div
          className={
            isFetching && !isLoading ? "opacity-60 transition-opacity" : "transition-opacity"
          }
        >
          {error && !notFound ? (
            <EmptyState
              title="We couldn't load the products"
              action={<Button onClick={() => refetch()}>Try again</Button>}
            >
              Check your connection and try once more.
            </EmptyState>
          ) : data && data.items.length === 0 ? (
            <EmptyState
              title="Nothing matches that"
              action={
                activeCount > 0 || filters.q ? (
                  <Button onClick={clearAll}>Clear filters</Button>
                ) : undefined
              }
            >
              {filters.q
                ? "Try a different word, or check the spelling."
                : "Try removing a filter or two."}
            </EmptyState>
          ) : (
            <>
              <ProductGrid products={data?.items} loading={isLoading} count={LIMIT / 2} />
              {data && (
                <Pagination
                  page={data.page}
                  pages={data.pages}
                  onChange={(p) => update({ page: String(p) })}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* mobile filter sheet */}
      {filtersOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Filters"
        >
          <div
            className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]"
            onClick={() => setFiltersOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 flex w-96 max-w-[90vw] flex-col bg-cream shadow-2xl">
            <div className="flex items-center justify-between border-b border-line p-4">
              <h2 className="text-xl">Filters</h2>
              <button
                className="grid size-10 place-items-center rounded-full hover:bg-brand-soft"
                onClick={() => setFiltersOpen(false)}
                aria-label="Close filters"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">{panel}</div>
            <div className="border-t border-line p-4">
              <Button className="w-full" onClick={() => setFiltersOpen(false)}>
                Show {data?.total ?? ""} results
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
