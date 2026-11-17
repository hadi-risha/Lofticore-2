import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type {
  CategoryNode,
  ProductDetail,
  ProductListResponse,
  ProductSummary,
  Suggestion,
} from "@lofticore/shared";
import { api } from "@/lib/api";
import type { ShopFilters } from "./filters";

// Query keys in one place so invalidation is never a guessing game.
export const catalogKeys = {
  categories: ["categories"] as const,
  products: (q: ShopFilters & { limit?: number }) => ["products", q] as const,
  product: (slug: string) => ["product", slug] as const,
  related: (slug: string) => ["product", slug, "related"] as const,
  bestSellers: ["products", "best-sellers"] as const,
  newArrivals: ["products", "new-arrivals"] as const,
  suggest: (q: string) => ["products", "suggest", q] as const,
};

export const useCategories = () =>
  useQuery({
    queryKey: catalogKeys.categories,
    queryFn: () =>
      api<{ categories: CategoryNode[] }>("/categories", { auth: false }).then((r) => r.categories),
    staleTime: 10 * 60_000,
  });

export const useProducts = (query: ShopFilters & { limit?: number }) =>
  useQuery({
    queryKey: catalogKeys.products(query),
    queryFn: ({ signal }) => api<ProductListResponse>("/products", { query, auth: false, signal }),
    // keep showing the old page while the next filter loads, so the grid doesn't flash
    placeholderData: keepPreviousData,
  });

export const useProduct = (slug: string) =>
  useQuery({
    queryKey: catalogKeys.product(slug),
    queryFn: () =>
      api<{ product: ProductDetail }>(`/products/${slug}`, { auth: false }).then((r) => r.product),
  });

export const useRelated = (slug: string) =>
  useQuery({
    queryKey: catalogKeys.related(slug),
    queryFn: () =>
      api<{ items: ProductSummary[] }>(`/products/${slug}/related`, { auth: false }).then(
        (r) => r.items,
      ),
  });

export const useBestSellers = (limit = 8) =>
  useQuery({
    queryKey: [...catalogKeys.bestSellers, limit],
    queryFn: () =>
      api<{ items: ProductSummary[] }>("/products/best-sellers", {
        query: { limit },
        auth: false,
      }).then((r) => r.items),
  });

export const useNewArrivals = (limit = 8) =>
  useQuery({
    queryKey: [...catalogKeys.newArrivals, limit],
    queryFn: () =>
      api<{ items: ProductSummary[] }>("/products/new-arrivals", {
        query: { limit },
        auth: false,
      }).then((r) => r.items),
  });

export const useSuggestions = (text: string) =>
  useQuery({
    queryKey: catalogKeys.suggest(text),
    queryFn: ({ signal }) =>
      api<{ suggestions: Suggestion[] }>("/products/suggest", {
        query: { q: text },
        auth: false,
        signal,
      }).then((r) => r.suggestions),
    enabled: text.trim().length >= 2,
    staleTime: 5 * 60_000,
  });
