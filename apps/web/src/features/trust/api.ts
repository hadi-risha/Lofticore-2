import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  NotificationDTO,
  Page,
  ProductSummary,
  ReportDTO,
  ReportInput,
  ReviewDTO,
  ReviewEligibility,
  ReviewInput,
  ReviewSummary,
} from "@lofticore/shared";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";

const useSignedIn = () => useAuthStore((s) => s.status === "authed");

/* ------------------------------------------------------------------ reviews */

interface ReviewPage {
  items: ReviewDTO[];
  summary: ReviewSummary;
  page: number;
  pages: number;
}

export const useReviews = (slug: string, sort: string, page: number) =>
  useQuery({
    queryKey: ["reviews", slug, sort, page],
    queryFn: () => api<ReviewPage>(`/products/${slug}/reviews`, { query: { sort, page } }),
    placeholderData: keepPreviousData,
  });

export const useReviewEligibility = (slug: string) => {
  const on = useSignedIn();
  return useQuery({
    queryKey: ["reviews", slug, "eligibility"],
    queryFn: () => api<ReviewEligibility>(`/products/${slug}/review-eligibility`),
    enabled: on,
  });
};

export const useSaveReview = (slug: string, existingId?: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: ReviewInput) =>
      existingId
        ? api(`/reviews/${existingId}`, { method: "PATCH", body: v })
        : api(`/products/${slug}/reviews`, { method: "POST", body: v }),
    meta: { silent: true },
    onSuccess: () => {
      toast.success(existingId ? "Review updated." : "Thanks for sharing your review!");
      // the product's stars and the list both change
      return Promise.all([
        qc.invalidateQueries({ queryKey: ["reviews", slug] }),
        qc.invalidateQueries({ queryKey: ["product", slug] }),
      ]);
    },
  });
};

export const useDeleteReview = (slug: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/reviews/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Review deleted.");
      return Promise.all([
        qc.invalidateQueries({ queryKey: ["reviews", slug] }),
        qc.invalidateQueries({ queryKey: ["product", slug] }),
      ]);
    },
  });
};

export const useVoteHelpful = (slug: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ helpful: boolean; count: number }>(`/reviews/${id}/helpful`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reviews", slug] }),
  });
};

/* ------------------------------------------------------------------ reports */

export const useSendReport = () =>
  useMutation({
    mutationFn: (v: ReportInput) =>
      api<{ report: ReportDTO }>("/reports", { method: "POST", body: v }),
    meta: { silent: true },
    onSuccess: () => toast.success("Thank you. Our team will look into it."),
  });

export const useAdminReports = (status: string, page: number) =>
  useQuery({
    queryKey: ["admin", "reports", status, page],
    queryFn: () => api<Page<ReportDTO>>("/admin/reports", { query: { status, page } }),
  });

export const useResolveReport = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      status: "resolved" | "dismissed";
      note: string;
      action: "none" | "hide_review" | "suspend_product";
    }) => api(`/admin/reports/${id}/resolve`, { method: "POST", body }),
    meta: { silent: true },
    onSuccess: () => {
      toast.success("Report closed. The reporter has been told.");
      return qc.invalidateQueries({ queryKey: ["admin"] });
    },
  });
};

/* ------------------------------------------------------------ notifications */

export const useNotifications = () => {
  const on = useSignedIn();
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () =>
      api<{ items: NotificationDTO[]; unread: number }>("/notifications", { query: { limit: 15 } }),
    enabled: on,
    // a light poll keeps the bell fresh without needing a live connection
    refetchInterval: 30_000,
  });
};

export const useReadNotifications = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id?: string) =>
      id
        ? api(`/notifications/${id}/read`, { method: "POST" })
        : api("/notifications/read-all", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
};

/* ---------------------------------------------------------- recommendations */

export const useBoughtTogether = (ids: string[], limit = 8) =>
  useQuery({
    queryKey: ["recs", "together", ids.join(","), limit],
    queryFn: () =>
      api<{ items: ProductSummary[] }>("/recommendations/bought-together", {
        query: { ids: ids.join(","), limit },
        auth: false,
      }).then((r) => r.items),
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
  });

export const useForYou = (viewed: string[], limit = 8) =>
  useQuery({
    queryKey: ["recs", "for-you", viewed.join(","), limit, useAuthStore.getState().user?.id],
    queryFn: () =>
      api<{ items: ProductSummary[]; personalised: boolean }>("/recommendations/for-you", {
        query: { viewed: viewed.join(","), limit },
      }),
    staleTime: 5 * 60_000,
  });

export const useRecentlyViewedProducts = (ids: string[]) =>
  useQuery({
    queryKey: ["recs", "viewed", ids.join(",")],
    queryFn: () =>
      api<{ items: ProductSummary[] }>("/recommendations/by-ids", {
        query: { ids: ids.join(",") },
        auth: false,
      }).then((r) => r.items),
    enabled: ids.length > 0,
  });
