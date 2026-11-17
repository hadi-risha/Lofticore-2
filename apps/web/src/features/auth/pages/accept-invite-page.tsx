import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { acceptInviteSchema } from "@lofticore/shared";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { useAcceptInvite } from "../api";
import { applyApiError } from "../form-errors";
import { AuthShell } from "../auth-shell";
import { establishSession } from "../session";

const schema = acceptInviteSchema.omit({ token: true });
type Values = z.infer<typeof schema>;

export function AcceptInvitePage() {
  const token = useSearchParams()[0].get("token");
  const navigate = useNavigate();
  const accept = useAcceptInvite();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  if (!token) return <Navigate to="/login" replace />;

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    accept.mutate(
      { token, ...values },
      {
        onSuccess: (res) => {
          establishSession(res);
          toast.success("Welcome to the team! One more step: set up two-factor.");
          navigate("/security/2fa", { replace: true });
        },
        onError: (err) => setFormError(applyApiError(err, setError)),
      },
    );
  });

  return (
    <AuthShell
      title="Join the Lofticore team"
      subtitle="Choose a password to finish setting up your admin account."
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field
          label="Your name"
          autoComplete="name"
          error={errors.name?.message}
          {...register("name")}
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
            {formError}{" "}
            <Link to="/login" className="underline">
              Sign in
            </Link>
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" loading={accept.isPending}>
          Create my account
        </Button>
      </form>
    </AuthShell>
  );
}
