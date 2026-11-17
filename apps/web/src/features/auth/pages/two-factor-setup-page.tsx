import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/bits";
import { errorMessage } from "@/lib/query-client";
import { useAuthStore } from "@/stores/auth.store";
import { useBeginTwoFactor, useEnableTwoFactor } from "../api";

// Team accounts must turn this on before the admin tools open.
export function TwoFactorSetupPage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const navigate = useNavigate();
  const begin = useBeginTwoFactor();
  const enable = useEnableTwoFactor();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  // the secret is created once when the page opens (not on every re-render)
  useEffect(() => {
    if (!user?.twoFactorEnabled && !begin.data && !begin.isPending) begin.mutate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (user?.twoFactorEnabled) return <Navigate to="/admin" replace />;

  const submit = (value: string) => {
    setError(null);
    enable.mutate(value, {
      onSuccess: ({ user: u }) => {
        setUser(u);
        toast.success("Two-factor is on. Your account is now protected.");
        navigate("/admin", { replace: true });
      },
      onError: (err) => {
        setError(errorMessage(err));
        setCode("");
      },
    });
  };

  return (
    <div className="container-page max-w-lg py-12">
      <div className="rounded-3xl border border-line bg-white p-7 sm:p-9">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-brand-soft text-brand">
          <ShieldCheck className="size-7" aria-hidden />
        </div>
        <h1 className="mt-4 text-center text-2xl">Protect your team account</h1>
        <p className="mt-2 text-center text-sm text-muted">
          Admin accounts need a second step at every sign-in. Scan this code with an authenticator
          app such as Google Authenticator, Authy or 1Password.
        </p>

        {begin.isPending || !begin.data ? (
          <Skeleton className="mx-auto mt-6 size-56" />
        ) : (
          <div className="mt-6 text-center">
            <img
              src={begin.data.qr}
              alt="QR code to add Lofticore to your authenticator app"
              className="mx-auto size-56 rounded-xl border border-line"
            />
            <p className="mt-4 text-xs text-muted">
              Can&apos;t scan? Enter this key in the app instead:
            </p>
            <p className="mt-1 select-all break-all font-mono text-sm font-semibold tracking-wider">
              {begin.data.secret}
            </p>
          </div>
        )}

        <form
          className="mt-7 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length === 6) submit(code);
          }}
        >
          <label htmlFor="setup-code" className="block text-sm font-medium">
            Then enter the 6-digit code it shows
          </label>
          <input
            id="setup-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="••••••"
            className="h-14 w-full rounded-xl border border-line text-center font-mono text-2xl tracking-[0.5em] outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
          {error && (
            <p role="alert" className="rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
              {error}
            </p>
          )}
          <Button
            type="submit"
            size="lg"
            className="w-full"
            loading={enable.isPending}
            disabled={code.length !== 6 || !begin.data}
          >
            Turn on two-factor
          </Button>
        </form>
      </div>
    </div>
  );
}
