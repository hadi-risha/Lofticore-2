import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { inviteStaffSchema } from "@lofticore/shared";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/bits";
import { applyApiError } from "@/features/auth/form-errors";
import { useAdminUsers, useInviteStaff } from "../api";
import { PageHeader, Pill, Table, Td, prettyStatus, statusTone } from "../ui";

type Values = z.infer<typeof inviteStaffSchema>;

export function AdminTeamPage() {
  const { data, isLoading } = useAdminUsers({ role: "admin", page: 1 });
  const invite = useInviteStaff();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(inviteStaffSchema) });

  const onSubmit = handleSubmit((v) => {
    setFormError(null);
    invite.mutate(v, {
      onSuccess: () => reset(),
      onError: (e) => setFormError(applyApiError(e, setError)),
    });
  });

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Team"
        subtitle="Admins are added by invitation only. They set a password and an authenticator app themselves."
      />

      <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
        <h2 className="text-lg">Invite an admin</h2>
        <form
          onSubmit={onSubmit}
          noValidate
          className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-start"
        >
          <Field label="Name" error={errors.name?.message} {...register("name")} />
          <Field label="Email" type="email" error={errors.email?.message} {...register("email")} />
          <Button type="submit" className="sm:mt-[27px]" loading={invite.isPending}>
            Send invite
          </Button>
        </form>
        {formError && (
          <p
            role="alert"
            className="mt-3 rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger"
          >
            {formError}
          </p>
        )}
        <p className="mt-3 text-xs text-muted">
          The invitation link works for 3 days and can be used once.
        </p>
      </section>

      <h2 className="mb-3 mt-8 text-lg">Current admins</h2>
      {isLoading ? (
        <Skeleton className="h-32" />
      ) : (
        <Table
          head={["Name", "Status", "Two-factor", ""]}
          empty={
            data?.items.length === 0 ? (
              <p className="p-5 text-sm text-muted">No admins besides you yet.</p>
            ) : null
          }
        >
          {data?.items.map((u) => (
            <tr key={u.id}>
              <Td>
                <p className="font-medium">{u.name}</p>
                <p className="text-xs text-muted">{u.email}</p>
              </Td>
              <Td>
                <Pill tone={statusTone(u.status)}>{prettyStatus(u.status)}</Pill>
              </Td>
              <Td>{u.twoFactorEnabled ? "On" : <span className="text-danger">Not set up</span>}</Td>
              <Td className="text-right">
                <Link
                  to={`/admin/users/${u.id}`}
                  className="font-medium text-brand hover:underline"
                >
                  Manage
                </Link>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
