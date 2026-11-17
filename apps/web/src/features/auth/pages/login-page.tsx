import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  ErrorCode,
  isStaff,
  loginSchema,
  type AuthResponse,
  type LoginInput,
} from "@lofticore/shared";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ApiError } from "@/lib/api";
import { errorMessage } from "@/lib/query-client";
import { useLogin, useLoginTwoFactor } from "../api";
import { applyApiError } from "../form-errors";
import { AuthShell } from "../auth-shell";
import { GoogleButton, googleEnabled } from "../google-button";
import { establishSession } from "../session";

export function LoginPage() {
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? "/";
  const [formError, setFormError] = useState<string | null>(null);
  // set after the password step when a team account still needs its authenticator code
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const login = useLogin();
  const loginCode = useLoginTwoFactor();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const finish = (res: AuthResponse) => {
    establishSession(res);
    toast.success(`Welcome back, ${res.user.name.split(" ")[0]}!`);
    // team accounts that haven't set up their authenticator can't use the admin tools yet
    navigate(isStaff(res.user.role) && !res.user.twoFactorEnabled ? "/security/2fa" : from, {
      replace: true,
    });
  };

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    login.mutate(values, {
      onSuccess: (res) => {
        if ("twoFactorRequired" in res) setChallenge(res.challengeToken);
        else finish(res);
      },
      onError: (err) => {
        // right password, email not verified yet: carry on to the code screen
        if (err instanceof ApiError && err.code === ErrorCode.AUTH_EMAIL_NOT_VERIFIED) {
          toast.info("Please verify your email. We've sent you a new code.");
          navigate(`/verify-email?email=${encodeURIComponent(values.email)}`);
          return;
        }
        setFormError(applyApiError(err, setError));
      },
    });
  });

  const submitCode = (value: string) => {
    if (!challenge) return;
    setFormError(null);
    loginCode.mutate(
      { challengeToken: challenge, code: value },
      {
        onSuccess: finish,
        onError: (err) => {
          setCode("");
          // an expired challenge means starting over from the password
          if (err instanceof ApiError && err.code === ErrorCode.AUTH_TOKEN_EXPIRED)
            setChallenge(null);
          setFormError(errorMessage(err));
        },
      },
    );
  };

  if (challenge) {
    return (
      <AuthShell
        title="Two-step check"
        subtitle="Open your authenticator app and enter the 6-digit code for Lofticore."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length === 6) submitCode(code);
          }}
          className="space-y-4"
        >
          <label htmlFor="totp" className="block text-sm font-medium">
            Authenticator code
          </label>
          <input
            id="totp"
            value={code}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 6);
              setCode(v);
              if (v.length === 6) submitCode(v);
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder="••••••"
            className="h-14 w-full rounded-xl border border-line bg-white text-center font-mono text-2xl tracking-[0.5em] outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
          {formError && (
            <p role="alert" className="rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
              {formError}
            </p>
          )}
          <Button
            type="submit"
            size="lg"
            className="w-full"
            loading={loginCode.isPending}
            disabled={code.length !== 6}
          >
            Verify and sign in
          </Button>
          <button
            type="button"
            className="block w-full text-center text-sm text-muted hover:text-brand"
            onClick={() => {
              setChallenge(null);
              setCode("");
              setFormError(null);
            }}
          >
            Use a different account
          </button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle={
        <>
          New here?{" "}
          <Link
            to="/register"
            className="font-medium text-brand underline-offset-2 hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email")}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register("password")}
        />
        <div className="text-right">
          <Link to="/forgot-password" className="text-sm text-brand hover:underline">
            Forgot password?
          </Link>
        </div>

        {formError && (
          <p role="alert" className="rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
            {formError}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" loading={login.isPending}>
          Sign in
        </Button>
      </form>

      {googleEnabled && (
        <>
          <div className="my-6 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>
          <GoogleButton />
        </>
      )}
    </AuthShell>
  );
}
