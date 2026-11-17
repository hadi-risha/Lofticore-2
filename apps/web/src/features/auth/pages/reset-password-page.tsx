import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { passwordSchema } from "@lofticore/shared";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { useResetPassword } from "../api";
import { applyApiError } from "../form-errors";
import { AuthShell } from "../auth-shell";

const schema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    message: "The passwords don't match.",
    path: ["confirm"],
  });
type Values = z.infer<typeof schema>;

export function ResetPasswordPage() {
  const token = useSearchParams()[0].get("token");
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const reset = useResetPassword();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  if (!token) return <Navigate to="/forgot-password" replace />;

  const onSubmit = handleSubmit(({ password }) => {
    setFormError(null);
    reset.mutate(
      { token, password },
      {
        onSuccess: () => {
          toast.success("Password updated. Sign in with your new password.");
          navigate("/login", { replace: true });
        },
        onError: (err) => setFormError(applyApiError(err, setError)),
      },
    );
  });

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="You'll be signed out on every device once it's changed."
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field
          label="New password"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          hint="At least 8 characters, with a letter and a number."
          {...register("password")}
        />
        <Field
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          error={errors.confirm?.message}
          {...register("confirm")}
        />
        {formError && (
          <p role="alert" className="rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
            {formError}{" "}
            <Link to="/forgot-password" className="font-medium underline">
              Request a new link
            </Link>
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" loading={reset.isPending}>
          Update password
        </Button>
      </form>
    </AuthShell>
  );
}
