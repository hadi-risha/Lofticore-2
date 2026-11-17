import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import { forgotPasswordSchema } from "@lofticore/shared";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { errorMessage } from "@/lib/query-client";
import { useForgotPassword } from "../api";
import { AuthShell } from "../auth-shell";

type Values = z.infer<typeof forgotPasswordSchema>;

export function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const forgot = useForgotPassword();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = handleSubmit((values) => {
    setError(null);
    forgot.mutate(values, {
      onSuccess: () => setSentTo(values.email),
      onError: (err) => setError(errorMessage(err)),
    });
  });

  if (sentTo) {
    return (
      <AuthShell title="Check your inbox">
        <div className="flex gap-4 rounded-2xl bg-brand-soft p-5">
          <MailCheck className="mt-0.5 size-6 shrink-0 text-brand" aria-hidden />
          <p className="text-sm">
            If <strong>{sentTo}</strong> has an account, a reset link is on its way. It works for 30
            minutes.
          </p>
        </div>
        <Link
          to="/login"
          className="mt-6 inline-block text-sm font-medium text-brand hover:underline"
        >
          Back to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="Enter your email and we'll send you a link to choose a new one."
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email")}
        />
        {error && (
          <p role="alert" className="rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" loading={forgot.isPending}>
          Send reset link
        </Button>
        <Link to="/login" className="block text-center text-sm text-muted hover:text-brand">
          Back to sign in
        </Link>
      </form>
    </AuthShell>
  );
}
