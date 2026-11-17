import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { Role, SELF_SIGNUP_ROLES, registerSchema, type RegisterInput } from "@lofticore/shared";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { useRegister } from "../api";
import { applyApiError } from "../form-errors";
import { AuthShell } from "../auth-shell";
import { GoogleButton, googleEnabled } from "../google-button";

const roleInfo: Record<(typeof SELF_SIGNUP_ROLES)[number], { label: string; note: string }> = {
  customer: { label: "Shop", note: "Buy furniture and decor." },
  seller: {
    label: "Sell",
    note: "List your products. Our team verifies every seller before they go live.",
  },
  delivery: {
    label: "Deliver",
    note: "Deliver orders in your area. Verified by our team before you start.",
  },
};

export function RegisterPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialRole = SELF_SIGNUP_ROLES.find((r) => r === params.get("role")) ?? Role.CUSTOMER;
  const [formError, setFormError] = useState<string | null>(null);
  const registerUser = useRegister();

  const {
    register,
    handleSubmit,
    setError,
    watch,
    setValue,
    formState: { errors },
  } = useForm<z.input<typeof registerSchema>, unknown, RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { role: initialRole },
  });
  const role = watch("role") ?? Role.CUSTOMER;

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    registerUser.mutate(values, {
      onSuccess: () => {
        toast.success("Account created. Check your email for a 6-digit code.");
        navigate(`/verify-email?email=${encodeURIComponent(values.email)}`);
      },
      onError: (err) => setFormError(applyApiError(err, setError)),
    });
  });

  return (
    <AuthShell
      title="Create your account"
      subtitle={
        <>
          Already have one?{" "}
          <Link to="/login" className="font-medium text-brand underline-offset-2 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">I want to</legend>
          <div className="grid grid-cols-3 gap-2" role="radiogroup">
            {SELF_SIGNUP_ROLES.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={role === r}
                onClick={() => setValue("role", r)}
                className={cn(
                  "h-11 rounded-xl border text-sm font-medium transition-colors",
                  role === r
                    ? "border-brand bg-brand text-white"
                    : "border-line bg-white hover:border-brand/50",
                )}
              >
                {roleInfo[r].label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">{roleInfo[role].note}</p>
        </fieldset>

        <Field
          label="Full name"
          autoComplete="name"
          error={errors.name?.message}
          {...register("name")}
        />
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
          autoComplete="new-password"
          hint="At least 8 characters, with a letter and a number."
          error={errors.password?.message}
          {...register("password")}
        />

        {formError && (
          <p role="alert" className="rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
            {formError}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" loading={registerUser.isPending}>
          Create account
        </Button>
      </form>

      {googleEnabled && (
        <>
          <div className="my-6 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>
          <GoogleButton role={role} />
        </>
      )}
    </AuthShell>
  );
}
