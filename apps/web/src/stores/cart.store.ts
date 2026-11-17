import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CartLine {
  productId: string;
  sku: string;
  slug: string;
  title: string;
  image: string;
  variantLabel?: string;
  price: number; // paise, as of when it was added
  qty: number;
}

// Guest cart, kept in the browser. When ordering arrives, signed-in carts move to
// the server and this one gets merged in at login.
interface CartState {
  lines: CartLine[];
  add: (line: Omit<CartLine, "qty">, qty?: number) => void;
  setQty: (sku: string, qty: number) => void;
  remove: (sku: string) => void;
  clear: () => void;
}

const MAX_PER_LINE = 10;

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      add: (line, qty = 1) =>
        set((s) => {
          const existing = s.lines.find((l) => l.sku === line.sku);
          if (existing) {
            return {
              lines: s.lines.map((l) =>
                l.sku === line.sku ? { ...l, qty: Math.min(MAX_PER_LINE, l.qty + qty) } : l,
              ),
            };
          }
          return { lines: [...s.lines, { ...line, qty: Math.min(MAX_PER_LINE, qty) }] };
        }),
      setQty: (sku, qty) =>
        set((s) => ({
          lines: s.lines.map((l) =>
            l.sku === sku ? { ...l, qty: Math.max(1, Math.min(MAX_PER_LINE, qty)) } : l,
          ),
        })),
      remove: (sku) => set((s) => ({ lines: s.lines.filter((l) => l.sku !== sku) })),
      clear: () => set({ lines: [] }),
    }),
    { name: "lofticore-cart" },
  ),
);

export const selectCartCount = (s: CartState) => s.lines.reduce((n, l) => n + l.qty, 0);
export const selectCartTotal = (s: CartState) => s.lines.reduce((n, l) => n + l.qty * l.price, 0);
