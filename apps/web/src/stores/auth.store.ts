import { create } from "zustand";
import type { PublicUser } from "@lofticore/shared";

// The access token lives in memory only - never localStorage - so a script
// injected into the page can't read it. A page reload gets a fresh one from the
// refresh cookie (see bootstrapAuth).
interface AuthState {
  user: PublicUser | null;
  accessToken: string | null;
  // "loading" until we've tried to restore the session on first load
  status: "loading" | "authed" | "guest";
  setSession: (user: PublicUser, accessToken: string) => void;
  setUser: (user: PublicUser) => void;
  clear: () => void;
}

// The refresh cookie is httpOnly, so the page can't tell whether one exists. This
// harmless flag says "this browser has signed in before", which lets first-time
// visitors skip a pointless refresh request (and the 401 it would log).
const HINT_KEY = "lofticore-signed-in";
export const hasSessionHint = () => {
  try {
    return localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return true; // storage blocked: just try the refresh
  }
};
const setHint = (on: boolean) => {
  try {
    if (on) localStorage.setItem(HINT_KEY, "1");
    else localStorage.removeItem(HINT_KEY);
  } catch {
    /* storage unavailable - the hint is only an optimisation */
  }
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  status: "loading",
  setSession: (user, accessToken) => {
    setHint(true);
    set({ user, accessToken, status: "authed" });
  },
  setUser: (user) => set({ user }),
  clear: () => {
    setHint(false);
    set({ user: null, accessToken: null, status: "guest" });
  },
}));
