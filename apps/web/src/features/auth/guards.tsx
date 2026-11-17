import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { isStaff, type Role } from "@lofticore/shared";
import { useAuthStore } from "@/stores/auth.store";

const Splash = () => (
  <div className="grid min-h-[50vh] place-items-center" role="status" aria-label="Loading">
    <Loader2 className="size-7 animate-spin text-brand" />
  </div>
);

// Signed-in users only. With `roles`, also checks the role - but the real check
// is on the server; this just keeps people from seeing a page they can't use.
export function RequireAuth({ roles }: { roles?: Role[] }) {
  const { status, user } = useAuthStore();
  const location = useLocation();

  if (status === "loading") return <Splash />;
  if (!user)
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}

// Login, register and friends: pointless once you're signed in.
export function GuestOnly() {
  const { status, user } = useAuthStore();
  const from = (useLocation().state as { from?: string } | null)?.from;
  if (status === "loading") return <Splash />;
  if (user) {
    // Signing in flips this guard before the login page's own redirect runs, so the
    // guard sends people where they were headed (or to the 2FA set-up they must do).
    const needsSetup = isStaff(user.role) && !user.twoFactorEnabled;
    return <Navigate to={needsSetup ? "/security/2fa" : (from ?? "/")} replace />;
  }
  return <Outlet />;
}

// Team members can't use the admin tools until their authenticator is set up
// (the server enforces this too).
export function RequireStaff2fa() {
  const user = useAuthStore((s) => s.user);
  if (user && !user.twoFactorEnabled) return <Navigate to="/security/2fa" replace />;
  return <Outlet />;
}
