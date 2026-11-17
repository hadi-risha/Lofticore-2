import type { AuthResponse } from "@lofticore/shared";
import { api, refreshSession } from "@/lib/api";
import { hasSessionHint, useAuthStore } from "@/stores/auth.store";

// Tabs tell each other about logins and logouts, so signing out in one tab signs
// out all of them and signing in in one wakes up the rest.
const channel =
  typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("lofticore-auth") : null;

export function startAuthSync() {
  if (!channel) return;
  channel.onmessage = (e: MessageEvent<"login" | "logout">) => {
    if (e.data === "logout") useAuthStore.getState().clear();
    if (e.data === "login") void refreshSession();
  };
}

// Called once on startup: if the refresh cookie is still good we're signed in.
export async function bootstrapAuth() {
  if (!hasSessionHint()) {
    useAuthStore.getState().clear();
    return;
  }
  const ok = await refreshSession();
  if (!ok) useAuthStore.getState().clear();
}

export function establishSession(res: AuthResponse) {
  useAuthStore.getState().setSession(res.user, res.accessToken);
  channel?.postMessage("login");
}

export async function signOut() {
  try {
    await api("/auth/logout", { method: "POST", auth: false });
  } finally {
    useAuthStore.getState().clear();
    channel?.postMessage("logout");
  }
}
