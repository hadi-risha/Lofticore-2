import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  AdminStats,
  AdminUserDetail,
  AdminUserRow,
  AuditEntryDTO,
  CategoryNode,
  OrderDTO,
  Page,
  ProductInput,
  PublicUser,
  SellerStats,
  ShipmentAction,
  UserAction,
  UserProfile,
} from "@lofticore/shared";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";

// Everything the seller, delivery and admin screens ask the server for.

const get = <T>(path: string, query?: Record<string, string | number | undefined>) =>
  api<T>(path, { query });
const send = <T>(path: string, method: "POST" | "PUT" | "PATCH" | "DELETE", body?: unknown) =>
  api<T>(path, { method, body });

/* ------------------------------------------------------------- own profile */

export const useMyProfile = () =>
  useQuery({
    queryKey: ["me", "profile"],
    queryFn: () => get<{ profile: UserProfile | null }>("/users/me/profile").then((r) => r.profile),
  });

export const useSubmitProfile = () => {
  const setUser = useAuthStore((s) => s.setUser);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: object) => send<{ user: PublicUser }>("/users/me/profile", "PUT", body),
    meta: { silent: true },
    onSuccess: ({ user }) => {
      setUser(user);
      toast.success("Details sent. We'll review them shortly.");
      return qc.invalidateQueries({ queryKey: ["me", "profile"] });
    },
  });
};

/* ------------------------------------------------------------------ seller */

export const useSellerStats = () =>
  useQuery({ queryKey: ["seller", "stats"], queryFn: () => get<SellerStats>("/seller/stats") });

export interface SellerProductRow {
  _id: string;
  title: string;
  slug: string;
  status: string;
  reviewNote?: string;
  images: { url: string }[];
  category: { name: string };
  variants: {
    sku: string;
    color?: string;
    size?: string;
    price: number;
    mrp: number;
    available: number;
    reserved: number;
  }[];
  updatedAt: string;
}

export const useSellerProducts = (status: string | undefined, page: number) =>
  useQuery({
    queryKey: ["seller", "products", status, page],
    queryFn: () => get<Page<SellerProductRow>>("/seller/products", { status, page }),
  });

export const useSellerProduct = (id?: string) =>
  useQuery({
    queryKey: ["seller", "product", id],
    queryFn: () =>
      get<{
        product: SellerProductRow & {
          description: string;
          brand?: string;
          material?: string;
          tags: string[];
          model3d?: { glbUrl?: string };
          dimensions: ProductInput["dimensions"];
          category: { _id: string; name: string };
        };
      }>(`/seller/products/${id}`).then((r) => r.product),
    enabled: Boolean(id),
  });

const invalidateSeller = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ queryKey: ["seller"] });

export const useSaveProduct = (id?: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: object) =>
      id
        ? send<{ product: { _id: string } }>(`/seller/products/${id}`, "PATCH", body)
        : send<{ product: { _id: string } }>("/seller/products", "POST", body),
    meta: { silent: true },
    onSuccess: () => invalidateSeller(qc),
  });
};

export const useProductAction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "submit" | "archive" }) =>
      action === "submit"
        ? send(`/seller/products/${id}/submit`, "POST")
        : send(`/seller/products/${id}`, "DELETE"),
    onSuccess: (_d, { action }) => {
      toast.success(
        action === "submit" ? "Sent for review. We'll let you know." : "Product archived.",
      );
      return invalidateSeller(qc);
    },
  });
};

export const useAdjustStock = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, sku, delta }: { id: string; sku: string; delta: number }) =>
      send(`/seller/products/${id}/stock`, "POST", {
        sku,
        delta,
        reason: delta > 0 ? "restock" : "adjustment",
      }),
    onSuccess: () => {
      toast.success("Stock updated.");
      return invalidateSeller(qc);
    },
  });
};

export const useUploadImage = () =>
  useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      const token = useAuthStore.getState().accessToken;
      const res = await fetch("/api/uploads/image", {
        method: "POST",
        body: form,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw Object.assign(new Error(data?.message ?? "Upload failed"), { data });
      return data.url as string;
    },
    onError: (e: Error) => toast.error(e.message),
  });

export const useUploadModel = () =>
  useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      const token = useAuthStore.getState().accessToken;
      const res = await fetch("/api/uploads/model", {
        method: "POST",
        body: form,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw Object.assign(new Error(data?.message ?? "Upload failed"), { data });
      return data.url as string;
    },
    onError: (e: Error) => toast.error(e.message),
  });

export const useSellerOrders = (page: number) =>
  useQuery({
    queryKey: ["seller", "orders", page],
    queryFn: () => get<Page<OrderDTO>>("/seller/orders", { page }),
  });

/* ---------------------------------------------------------------- shipments */

export const useAdvanceShipment = (invalidate: string[]) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      orderId,
      shipmentId,
      action,
      deliveryCode,
    }: {
      orderId: string;
      shipmentId: string;
      action: ShipmentAction;
      deliveryCode?: string;
    }) =>
      send<{ order: OrderDTO }>(`/shipments/${orderId}/${shipmentId}/advance`, "POST", {
        action,
        deliveryCode,
      }),
    onSuccess: () => {
      toast.success("Updated.");
      return qc.invalidateQueries({ queryKey: invalidate });
    },
  });
};

export const useDeliveryOrders = () =>
  useQuery({
    queryKey: ["delivery", "orders"],
    queryFn: () => get<{ items: OrderDTO[] }>("/delivery/orders").then((r) => r.items),
    refetchInterval: 30_000,
  });

/* -------------------------------------------------------------------- admin */

export const useAdminStats = () =>
  useQuery({ queryKey: ["admin", "stats"], queryFn: () => get<AdminStats>("/admin/stats") });

export const useAdminUsers = (f: { role?: string; status?: string; q?: string; page: number }) =>
  useQuery({
    queryKey: ["admin", "users", f],
    queryFn: () => get<Page<AdminUserRow>>("/admin/users", f),
  });

export const useAdminUser = (id: string) =>
  useQuery({
    queryKey: ["admin", "user", id],
    queryFn: () => get<{ user: AdminUserDetail }>(`/admin/users/${id}`).then((r) => r.user),
  });

export const useUserDecision = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      action: UserAction;
      reason?: string;
      activeOrders?: "complete" | "cancel";
    }) =>
      send<{ user: AdminUserRow; cancelledOrders: number }>(
        `/admin/users/${id}/decision`,
        "POST",
        v,
      ),
    meta: { silent: true },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }),
  });
};

export const useResetTwoFactor = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => send(`/admin/users/${id}/reset-2fa`, "POST"),
    onSuccess: () => {
      toast.success("Authenticator reset. They'll set up a new one at next sign-in.");
      return qc.invalidateQueries({ queryKey: ["admin"] });
    },
  });
};

export interface ReviewRow {
  _id: string;
  title: string;
  slug: string;
  description: string;
  images: { url: string }[];
  category: { name: string };
  seller: { name: string; email: string };
  variants: { sku: string; price: number; mrp: number; available: number }[];
  dimensions: { widthCm: number; depthCm: number; heightCm: number };
  updatedAt: string;
}

export const useReviewQueue = (status: string, page: number) =>
  useQuery({
    queryKey: ["admin", "products", status, page],
    queryFn: () => get<Page<ReviewRow>>("/admin/products", { status, page }),
  });

export const useReviewProduct = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      decision,
      note,
    }: {
      id: string;
      decision: "approve" | "reject";
      note?: string;
    }) => send(`/admin/products/${id}/review`, "POST", { decision, note }),
    onSuccess: (_d, v) => {
      toast.success(
        v.decision === "approve"
          ? "Product approved and live."
          : "Product sent back to the seller.",
      );
      return qc.invalidateQueries({ queryKey: ["admin"] });
    },
  });
};

export const useAdminOrders = (status: string | undefined, page: number) =>
  useQuery({
    queryKey: ["admin", "orders", status, page],
    queryFn: () => get<Page<OrderDTO>>("/admin/orders", { status, page }),
  });

export const useAssignAgent = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      orderId,
      shipmentId,
      agentId,
    }: {
      orderId: string;
      shipmentId: string;
      agentId: string;
    }) => send(`/admin/shipments/${orderId}/${shipmentId}/assign`, "POST", { agentId }),
    onSuccess: () => {
      toast.success("Delivery partner assigned.");
      return qc.invalidateQueries({ queryKey: ["admin", "orders"] });
    },
  });
};

export const useAuditLog = (action: string | undefined, page: number) =>
  useQuery({
    queryKey: ["admin", "audit", action, page],
    queryFn: () => get<Page<AuditEntryDTO>>("/admin/audit", { action, page }),
  });

export const useInviteStaff = () =>
  useMutation({
    mutationFn: (v: { name: string; email: string }) => send("/auth/invite-staff", "POST", v),
    meta: { silent: true },
    onSuccess: () => toast.success("Invitation sent."),
  });

export const useCategoryOptions = (nodes: CategoryNode[] | undefined) =>
  (nodes ?? []).flatMap((p) =>
    p.children.length
      ? p.children.map((c) => ({ id: c.id, label: `${p.name} › ${c.name}` }))
      : [{ id: p.id, label: p.name }],
  );

export const useUpdateVariantPrice = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      sku,
      price,
      mrp,
    }: {
      id: string;
      sku: string;
      price: number;
      mrp: number;
    }) => send(`/seller/products/${id}/variants/${sku}`, "PATCH", { price, mrp }),
    onSuccess: () => {
      toast.success("Price updated.");
      return qc.invalidateQueries({ queryKey: ["seller"] });
    },
  });
};
