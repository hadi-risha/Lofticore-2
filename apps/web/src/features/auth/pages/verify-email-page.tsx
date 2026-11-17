import { useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/query-client";
import { useResendOtp, useVerifyEmail } from "../api";
import { AuthShell } from "../auth-shell";
import { establishSession } from "../session";

const RESEND_SECONDS = 60;

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const email = params.get("email");
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(RESEND_SECONDS);
  const verify = useVerifyEmail();
  const resend = useResendOtp();

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  if (!email) return <Navigate to="/register" replace />;

  const submit = (value: string) => {
    setError(null);
    verify.mutate(
      { email, code: value },
      {
        onSuccess: (res) => {
          establishSession(res);
          toast.success("Email verified. You're all set!");
          navigate("/", { replace: true });
        },
        onError: (err) => {
          setError(errorMessage(err));
          setCode("");
        },
      },
    );
  };

  return (
    <AuthShell
      title="Check your email"
      subtitle={
        <>
          We sent a 6-digit code to <strong className="text-ink">{email}</strong>. It expires in 10
          minutes.
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (code.length === 6) submit(code);
        }}
        className="space-y-4"
      >
        <label htmlFor="otp" className="block text-sm font-medium">
          Verification code
        </label>
        <input
          id="otp"
          value={code}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 6);
            setCode(v);
            // submit as soon as the sixth digit lands
            if (v.length === 6) submit(v);
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          placeholder="••••••"
          aria-invalid={Boolean(error)}
          className="h-14 w-full rounded-xl border border-line bg-white text-center font-mono text-2xl tracking-[0.5em] outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
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
          loading={verify.isPending}
          disabled={code.length !== 6}
        >
          Verify and continue
        </Button>
      </form>

      <div className="mt-6 text-center text-sm text-muted">
        Didn&apos;t get it?{" "}
        <button
          className="font-medium text-brand hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline"
          disabled={wait > 0 || resend.isPending}
          onClick={() =>
            resend.mutate(
              { email },
              {
                onSuccess: () => {
                  toast.success("A new code is on its way.");
                  setWait(RESEND_SECONDS);
                },
                onError: (err) => toast.error(errorMessage(err)),
              },
            )
          }
        >
          {wait > 0 ? `Resend in ${wait}s` : "Resend code"}
        </button>
      </div>
    </AuthShell>
  );
}
