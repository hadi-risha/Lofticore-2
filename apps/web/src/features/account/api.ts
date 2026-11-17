import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AddressDTO, AddressInput, ProductSummary } from "@lofticore/shared";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";

export const accountKeys = {
  addresses: ["addresses"] as const,
  wishlist: ["wishlist"] as const,
  wishlistIds: ["wishlist", "ids"] as const,
};

/* ---------------------------------------------------------------- addresses */

export const useAddresses = () => {
  const signedIn = useAuthStore((s) => s.status === "authed");
  return useQuery({
    queryKey: accountKeys.addresses,
    queryFn: () => api<{ addresses: AddressDTO[] }>("/addresses").then((r) => r.addresses),
    enabled: signedIn,
  });
};

export const useSaveAddress = (id?: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: AddressInput) =>
      api<{ address: AddressDTO }>(id ? `/addresses/${id}` : "/addresses", {
        method: id ? "PUT" : "POST",
        body: v,
      }).then((r) => r.address),
    // the form shows field errors itself
    meta: { silent: true },
    onSuccess: () => qc.invalidateQueries({ queryKey: accountKeys.addresses }),
  });
};

export const useDeleteAddress = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/addresses/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Address removed.");
      return qc.invalidateQueries({ queryKey: accountKeys.addresses });
    },
  });
};

/* ----------------------------------------------------------------- wishlist */

export const useWishlist = () =>
  useQuery({
    queryKey: accountKeys.wishlist,
    queryFn: () => api<{ items: ProductSummary[] }>("/wishlist").then((r) => r.items),
  });

export const useWishlistIds = () => {
  const signedIn = useAuthStore((s) => s.status === "authed");
  return useQuery({
    queryKey: accountKeys.wishlistIds,
    queryFn: () => api<{ ids: string[] }>("/wishlist/ids").then((r) => new Set(r.ids)),
    enabled: signedIn,
    staleTime: 5 * 60_000,
  });
};

// Updates the heart instantly and rolls back if the server says no.
export const useToggleWishlist = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, saved }: { productId: string; saved: boolean }) =>
      api(`/wishlist/${productId}`, { method: saved ? "DELETE" : "PUT" }),
    onMutate: async ({ productId, saved }) => {
      await qc.cancelQueries({ queryKey: accountKeys.wishlistIds });
      const before = qc.getQueryData<Set<string>>(accountKeys.wishlistIds);
      const next = new Set(before);
      if (saved) next.delete(productId);
      else next.add(productId);
      qc.setQueryData(accountKeys.wishlistIds, next);
      return { before };
    },
    onError: (_e, _v, ctx) => ctx?.before && qc.setQueryData(accountKeys.wishlistIds, ctx.before),
    onSuccess: (_d, { saved }) =>
      toast.success(saved ? "Removed from your wishlist." : "Saved to your wishlist."),
    onSettled: () => qc.invalidateQueries({ queryKey: accountKeys.wishlist }),
  });
};
