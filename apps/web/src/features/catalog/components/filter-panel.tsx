import { useState } from "react";
import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { formatINR, type CategoryNode, type Facets } from "@lofticore/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { splitList, toggleInList, type ShopFilters } from "../filters";

interface Props {
  filters: ShopFilters;
  facets?: Facets;
  categories: CategoryNode[];
  activeCategory?: string;
  update: (patch: Partial<ShopFilters>) => void;
  clearAll: () => void;
  activeCount: number;
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="border-b border-line py-5 first:pt-0 last:border-0">
    <h3 className="mb-3 font-sans text-sm font-semibold">{title}</h3>
    {children}
  </section>
);

function Check({
  label,
  count,
  checked,
  onChange,
}: {
  label: string;
  count?: number;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 py-1 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="size-4 rounded border-line accent-brand"
      />
      <span className="flex-1">{label}</span>
      {count !== undefined && <span className="text-xs text-muted">{count}</span>}
    </label>
  );
}

// Price inputs are in rupees for people, but the API works in paise.
function PriceRange({ filters, facets, update }: Pick<Props, "filters" | "facets" | "update">) {
  const toRupees = (p?: string) => (p ? String(Math.round(Number(p) / 100)) : "");
  const [min, setMin] = useState(toRupees(filters.minPrice));
  const [max, setMax] = useState(toRupees(filters.maxPrice));

  const apply = () =>
    update({
      minPrice: min ? String(Number(min) * 100) : undefined,
      maxPrice: max ? String(Number(max) * 100) : undefined,
    });

  const input =
    "h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-brand";
  return (
    <>
      <div className="flex items-center gap-2">
        <input
          inputMode="numeric"
          aria-label="Minimum price in rupees"
          placeholder="Min"
          value={min}
          onChange={(e) => setMin(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && apply()}
          className={input}
        />
        <span className="text-muted">–</span>
        <input
          inputMode="numeric"
          aria-label="Maximum price in rupees"
          placeholder="Max"
          value={max}
          onChange={(e) => setMax(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && apply()}
          className={input}
        />
      </div>
      {facets && facets.price.max > 0 && (
        <p className="mt-2 text-xs text-muted">
          {formatINR(facets.price.min)} to {formatINR(facets.price.max)} here
        </p>
      )}
      <Button size="sm" variant="secondary" className="mt-3 w-full" onClick={apply}>
        Apply price
      </Button>
    </>
  );
}

export function FilterPanel({
  filters,
  facets,
  categories,
  activeCategory,
  update,
  clearAll,
  activeCount,
}: Props) {
  return (
    <div>
      <Section title="Category">
        <ul className="space-y-0.5 text-sm">
          <li>
            <Link
              to="/shop"
              className={cn(
                "block rounded-lg px-2 py-1.5 hover:bg-brand-soft",
                !activeCategory && "font-semibold text-brand",
              )}
            >
              All products
            </Link>
          </li>
          {categories.map((c) => (
            <li key={c.id}>
              <Link
                to={`/shop/${c.slug}`}
                className={cn(
                  "block rounded-lg px-2 py-1.5 hover:bg-brand-soft",
                  activeCategory === c.slug && "font-semibold text-brand",
                )}
              >
                {c.name}
              </Link>
              <ul className="ml-3 border-l border-line pl-2">
                {c.children.map((ch) => (
                  <li key={ch.id}>
                    <Link
                      to={`/shop/${ch.slug}`}
                      className={cn(
                        "block rounded-lg px-2 py-1 text-muted hover:bg-brand-soft",
                        activeCategory === ch.slug && "font-semibold text-brand",
                      )}
                    >
                      {ch.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Price (₹)">
        <PriceRange
          key={`${filters.minPrice}-${filters.maxPrice}`}
          filters={filters}
          facets={facets}
          update={update}
        />
      </Section>

      {facets && facets.materials.length > 0 && (
        <Section title="Material">
          {facets.materials.slice(0, 8).map((m) => (
            <Check
              key={m.value}
              label={m.value}
              count={m.count}
              checked={splitList(filters.material).includes(m.value)}
              onChange={() => update({ material: toggleInList(filters.material, m.value) })}
            />
          ))}
        </Section>
      )}

      {facets && facets.colors.length > 0 && (
        <Section title="Colour">
          {facets.colors.slice(0, 8).map((c) => (
            <Check
              key={c.value}
              label={c.value}
              count={c.count}
              checked={splitList(filters.color).includes(c.value)}
              onChange={() => update({ color: toggleInList(filters.color, c.value) })}
            />
          ))}
        </Section>
      )}

      <Section title="Rating">
        {[4, 3].map((r) => (
          <label key={r} className="flex cursor-pointer items-center gap-2.5 py-1 text-sm">
            <input
              type="radio"
              name="rating"
              checked={filters.rating === String(r)}
              onChange={() => update({ rating: String(r) })}
              className="size-4 accent-brand"
            />
            <span className="inline-flex items-center gap-1">
              {r} <Star className="size-3.5 fill-gold text-gold" aria-hidden /> &amp; up
            </span>
          </label>
        ))}
      </Section>

      <Section title="Availability">
        <Check
          label="In stock only"
          checked={filters.inStock === "true"}
          onChange={() => update({ inStock: filters.inStock ? undefined : "true" })}
        />
      </Section>

      {activeCount > 0 && (
        <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={clearAll}>
          Clear all filters ({activeCount})
        </Button>
      )}
    </div>
  );
}
