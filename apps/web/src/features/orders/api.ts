import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  OrderStatus,
  PaymentStatus,
  type CheckoutInput,
  type OrderDTO,
  type Page,
  type PaymentDTO,
} from "@lofticore/shared";
import { api } from "@/lib/api";

export const orderKeys = {
  list: (page: number) => ["orders", "list", page] as const,
  one: (id: string) => ["orders", id] as const,
};

// which online payment options the server offers (Razorpay needs keys on the server)
export const usePaymentMethods = () =>
  useQuery({
    queryKey: ["payment-methods"],
    queryFn: () => api<{ razorpay: boolean; upi: boolean }>("/payments/methods", { auth: false }),
    staleTime: 5 * 60_000,
  });

export const useVerifyRazorpay = (orderId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      paymentId: string;
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
    }) => {
      const { paymentId, ...body } = v;
      return api(`/payments/${paymentId}/razorpay/verify`, { method: "POST", body });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: orderKeys.one(orderId) }),
  });
};

export const useCheckout = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: CheckoutInput) =>
      api<{ order: OrderDTO }>("/checkout", { method: "POST", body: v }).then((r) => r.order),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] }),
  });
};

export const useOrders = (page: number) =>
  useQuery({
    queryKey: orderKeys.list(page),
    queryFn: () => api<Page<OrderDTO>>("/orders", { query: { page } }),
  });

// Order changes arrive live over server-sent events (see use-live-updates). While a
// payment is pending this slower poll is only a safety net if that connection drops.
export const useOrder = (id: string, opts: { poll?: boolean } = {}) =>
  useQuery({
    queryKey: orderKeys.one(id),
    queryFn: () => api<{ order: OrderDTO }>(`/orders/${id}`).then((r) => r.order),
    refetchInterval: (q) => {
      const o = q.state.data;
      const waiting =
        o?.status === OrderStatus.PENDING_PAYMENT && o.payment?.status !== PaymentStatus.EXPIRED;
      return opts.poll && waiting ? 15_000 : false;
    },
  });

export const useCancelOrder = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<{ order: OrderDTO }>(`/orders/${id}/cancel`, { method: "POST" }).then((r) => r.order),
    onSuccess: (order) => {
      toast.success(
        order.payment?.status === PaymentStatus.REFUNDED
          ? "Order cancelled. Your payment is being refunded."
          : "Order cancelled.",
      );
      qc.setQueryData(orderKeys.one(id), order);
      return qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
};

export const useRetryPayment = (orderId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paymentId: string) =>
      api<{ payment: PaymentDTO }>(`/payments/${paymentId}/retry`, { method: "POST" }).then(
        (r) => r.payment,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: orderKeys.one(orderId) }),
  });
};

/* ---------------------------------------------------- the demo UPI app (public) */

export interface MockPaymentInfo {
  paymentId: string;
  status: PaymentStatus;
  amount: number;
  payee: string;
  payeeVpa: string;
  orderNumber?: string;
  expiresAt?: string;
}

export const useMockPayment = (token: string) =>
  useQuery({
    queryKey: ["mock-upi", token],
    queryFn: () => api<MockPaymentInfo>(`/mock-upi/${token}`, { auth: false }),
    retry: false,
  });

export const useMockRespond = (token: string) =>
  useMutation({
    mutationFn: (v: { decision: "approve" | "decline"; pin?: string }) =>
      api<{ status: PaymentStatus; reason?: string }>(`/mock-upi/${token}/respond`, {
        method: "POST",
        body: v,
        auth: false,
      }),
    meta: { silent: true },
  });
