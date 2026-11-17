import { create } from "zustand";
import { persist } from "zustand/middleware";

const MAX = 12;

// Product ids you've looked at, newest first. Kept in the browser (no account
// needed) and used to tailor the home page and recommendations.
interface ViewedState {
  ids: string[];
  add: (id: string) => void;
}

export const useRecentlyViewed = create<ViewedState>()(
  persist(
    (set) => ({
      ids: [],
      add: (id) => set((s) => ({ ids: [id, ...s.ids.filter((x) => x !== id)].slice(0, MAX) })),
    }),
    { name: "lofticore-viewed" },
  ),
);
