import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

// The shop's filter state lives in the URL, so every filtered view can be
// bookmarked, shared, and survives a refresh and the back button.
export type ShopFilters = {
  q?: string;
  category?: string;
  minPrice?: string; // paise
  maxPrice?: string;
  material?: string; // comma separated
  color?: string;
  inStock?: string; // "true"
  rating?: string;
  sort?: string;
  page?: string;
};

const KEYS: (keyof ShopFilters)[] = [
  "q",
  "minPrice",
  "maxPrice",
  "material",
  "color",
  "inStock",
  "rating",
  "sort",
  "page",
];

export const splitList = (v?: string) => (v ? v.split(",").filter(Boolean) : []);

export function useShopFilters(categoryFromRoute?: string) {
  const [params, setParams] = useSearchParams();

  const filters = useMemo<ShopFilters>(() => {
    const f: ShopFilters = {};
    for (const k of KEYS) {
      const v = params.get(k);
      if (v) f[k] = v;
    }
    if (categoryFromRoute) f.category = categoryFromRoute;
    return f;
  }, [params, categoryFromRoute]);

  // Changing any filter sends you back to page 1, except changing the page itself.
  const update = useCallback(
    (patch: Partial<ShopFilters>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v) next.set(k, v);
            else next.delete(k);
          }
          if (!("page" in patch)) next.delete("page");
          return next;
        },
        { preventScrollReset: "page" in patch ? false : true },
      );
    },
    [setParams],
  );

  const clearAll = useCallback(() => {
    setParams((prev) => {
      const next = new URLSearchParams();
      const q = prev.get("q");
      if (q) next.set("q", q);
      return next;
    });
  }, [setParams]);

  const activeCount =
    (filters.minPrice || filters.maxPrice ? 1 : 0) +
    splitList(filters.material).length +
    splitList(filters.color).length +
    (filters.inStock ? 1 : 0) +
    (filters.rating ? 1 : 0);

  return { filters, update, clearAll, activeCount };
}

export const toggleInList = (list: string | undefined, value: string) => {
  const items = splitList(list);
  const next = items.includes(value) ? items.filter((i) => i !== value) : [...items, value];
  return next.join(",");
};
