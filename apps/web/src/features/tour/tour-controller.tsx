import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { create } from "zustand";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";
import { runTour, tourHome } from "./tour";

// Lets other parts of the app (the account menu, the chat assistant) ask for the tour.
interface TourRequest {
  requested: number;
  start: () => void;
}
export const useTourRequests = create<TourRequest>((set) => ({
  requested: 0,
  start: () => set((s) => ({ requested: s.requested + 1 })),
}));

const seenKey = (userId: string) => `lofticore-tour-seen-${userId}`;
const remember = (userId: string) => {
  try {
    localStorage.setItem(seenKey(userId), "1");
  } catch {
    /* private mode: the server flag still protects us */
  }
};
const alreadySeen = (userId: string) => {
  try {
    return localStorage.getItem(seenKey(userId)) === "1";
  } catch {
    return false;
  }
};

// Starts the tour on someone's first visit, and whenever it's asked for again.
export function TourController() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const requested = useTourRequests((s) => s.requested);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const lastRequest = useRef(0);
  const running = useRef(false);

  const begin = (userId: string, role: NonNullable<typeof user>["role"]) => {
    if (running.current) return;
    running.current = true;
    // wait a moment so the page behind the tour has finished drawing
    setTimeout(() => {
      runTour(role, () => {
        running.current = false;
        remember(userId);
        api<{ user: NonNullable<typeof user> }>("/users/me/tour-complete", { method: "POST" })
          .then((r) => setUser(r.user))
          .catch(() => undefined);
      });
    }, 700);
  };

  // first sign-in
  useEffect(() => {
    if (!user || user.tourCompleted || alreadySeen(user.id)) return;
    // a new seller or admin starts in their own area, where their menu is
    const home = tourHome(user.role);
    if (home !== "/" && !pathname.startsWith(home) && pathname !== "/security/2fa") {
      // team members set up two-factor first, and only then get the tour
      navigate(home);
      return;
    }
    if (pathname === "/security/2fa") return;
    begin(user.id, user.role);
  }, [user?.id, user?.tourCompleted, pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // replayed on request
  useEffect(() => {
    if (!user || requested === lastRequest.current) return;
    lastRequest.current = requested;
    const home = tourHome(user.role);
    if (home !== "/" && !pathname.startsWith(home)) navigate(home);
    begin(user.id, user.role);
  }, [requested]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
