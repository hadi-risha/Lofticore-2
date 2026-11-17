import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { AccountStatus, Role, UserAction, type UserProfile } from "@lofticore/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/bits";
import { ApiError } from "@/lib/api";
import { errorMessage } from "@/lib/query-client";
import { useAuthStore } from "@/stores/auth.store";
import { NotFoundPage } from "@/pages/not-found";
import { useAdminUser, useResetTwoFactor, useUserDecision } from "../api";
import { PageHeader, Pill, prettyStatus, statusTone, when } from "../ui";

const LABELS: Record<string, string> = {
  businessName: "Business name",
  phone: "Phone",
  addressLine: "Address",
  city: "City",
  state: "State",
  pincode: "Pincode",
  gstin: "GSTIN",
  pan: "PAN",
  payoutUpi: "Payout UPI",
  vehicle: "Vehicle",
  licenceNumber: "Licence number",
  serviceAreas: "Delivers to",
};

type Pending = {
  action: UserAction;
  title: string;
  confirm: string;
  danger?: boolean;
  needsReason: boolean;
  mentionOrders?: boolean;
};

export function AdminUserPage() {
  const { userId = "" } = useParams();
  const me = useAuthStore((s) => s.user);
  const { data: u, error, isLoading } = useAdminUser(userId);
  const decision = useUserDecision(userId);
  const reset2fa = useResetTwoFactor();

  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState("");
  const [orders, setOrders] = useState<"complete" | "cancel">("complete");
  const [problem, setProblem] = useState<string | null>(null);

  if (error instanceof ApiError && error.status === 404) return <NotFoundPage />;
  if (isLoading || !u) return <Skeleton className="h-96" />;

  const isTeam = u.role === Role.ADMIN || u.role === Role.SUPER_ADMIN;
  const canManage =
    u.role !== Role.SUPER_ADMIN &&
    u.id !== me?.id &&
    (u.role !== Role.ADMIN || me?.role === Role.SUPER_ADMIN);
  const needsApproval = u.role === Role.SELLER || u.role === Role.DELIVERY;
  const awaiting =
    u.status === AccountStatus.PENDING_APPROVAL || u.status === AccountStatus.REJECTED;

  const open = (p: Pending) => {
    setPending(p);
    setReason("");
    setOrders("complete");
    setProblem(null);
  };

  const submit = () => {
    if (!pending) return;
    setProblem(null);
    decision.mutate(
      { action: pending.action, reason: reason.trim() || undefined, activeOrders: orders },
      {
        onSuccess: (r) => {
          toast.success(
            r.cancelledOrders
              ? `Done. ${r.cancelledOrders} open order${r.cancelledOrders === 1 ? " was" : "s were"} cancelled and refunded.`
              : "Done. They've been emailed.",
          );
          setPending(null);
        },
        onError: (e) =>
          setProblem(e instanceof ApiError && e.fields?.reason ? e.fields.reason : errorMessage(e)),
      },
    );
  };

  const profile = u.profile as (UserProfile & Record<string, unknown>) | undefined;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={u.name}
        subtitle={
          <Link to="/admin/users" className="text-brand hover:underline">
            ← All people
          </Link>
        }
      />

      <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Pill tone={statusTone(u.status)}>{prettyStatus(u.status)}</Pill>
          <span className="text-sm">{prettyStatus(u.role)}</span>
          <span className="text-sm text-muted">
            {u.email}
            {!u.emailVerified && " (not verified)"}
          </span>
        </div>
        {u.statusReason && (
          <p className="mt-3 rounded-xl bg-brand-soft p-3 text-sm">
            Reason on file: {u.statusReason}
          </p>
        )}
        <dl className="mt-5 grid grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-muted">Joined</dt>
            <dd className="font-medium">{when(u.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-muted">Orders</dt>
            <dd className="font-medium">
              {u.stats.orders} ({u.stats.openOrders} open)
            </dd>
          </div>
          {u.role === Role.SELLER && (
            <div>
              <dt className="text-muted">Products</dt>
              <dd className="font-medium">{u.stats.products}</dd>
            </div>
          )}
          {isTeam && (
            <div>
              <dt className="text-muted">Two-factor</dt>
              <dd className="font-medium">{u.twoFactorEnabled ? "On" : "Not set up"}</dd>
            </div>
          )}
        </dl>
      </section>

      {needsApproval && (
        <section className="mt-6 rounded-2xl border border-line bg-white p-5 sm:p-6">
          <h2 className="text-lg">Submitted details</h2>
          {!profile?.submittedAt ? (
            <p className="mt-2 text-sm text-muted">
              They haven&apos;t sent their details yet, so they can&apos;t be approved.
            </p>
          ) : (
            <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              {Object.entries(LABELS)
                .filter(([k]) => profile[k] !== undefined && profile[k] !== "")
                .map(([k, label]) => (
                  <div key={k}>
                    <dt className="text-muted">{label}</dt>
                    <dd className="font-medium">
                      {Array.isArray(profile[k])
                        ? (profile[k] as string[]).join(", ")
                        : String(profile[k])}
                    </dd>
                  </div>
                ))}
              <div>
                <dt className="text-muted">Sent</dt>
                <dd className="font-medium">{when(profile.submittedAt)}</dd>
              </div>
            </dl>
          )}
        </section>
      )}

      {canManage && (
        <section className="mt-6 flex flex-wrap gap-3 rounded-2xl border border-line bg-white p-5 sm:p-6">
          {needsApproval && awaiting && (
            <Button
              disabled={!u.profileSubmitted}
              onClick={() =>
                open({
                  action: UserAction.APPROVE,
                  title: `Approve ${u.name}?`,
                  confirm: "Approve",
                  needsReason: false,
                })
              }
            >
              Approve
            </Button>
          )}
          {needsApproval && u.status === AccountStatus.PENDING_APPROVAL && (
            <Button
              variant="secondary"
              onClick={() =>
                open({
                  action: UserAction.REJECT,
                  title: `Reject ${u.name}'s application?`,
                  confirm: "Reject",
                  needsReason: true,
                })
              }
            >
              Reject…
            </Button>
          )}
          {u.status !== AccountStatus.BLOCKED && (
            <Button
              variant="danger"
              onClick={() =>
                open({
                  action: UserAction.BLOCK,
                  title: `Block ${u.name}?`,
                  confirm: "Block account",
                  danger: true,
                  needsReason: true,
                  mentionOrders: u.role !== Role.DELIVERY && !isTeam,
                })
              }
            >
              Block…
            </Button>
          )}
          {u.status === AccountStatus.BLOCKED && (
            <Button
              onClick={() =>
                open({
                  action: UserAction.UNBLOCK,
                  title: `Restore ${u.name}'s account?`,
                  confirm: "Unblock",
                  needsReason: false,
                })
              }
            >
              Unblock
            </Button>
          )}
          {isTeam && me?.role === Role.SUPER_ADMIN && u.twoFactorEnabled && (
            <Button
              variant="secondary"
              loading={reset2fa.isPending}
              onClick={() => reset2fa.mutate(u.id)}
            >
              Reset their authenticator
            </Button>
          )}
        </section>
      )}

      {pending && (
        <div
          className="fixed inset-0 z-50 grid place-items-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="decision-title"
        >
          <div
            className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]"
            onClick={() => setPending(null)}
          />
          <div className="relative w-full max-w-md rounded-2xl bg-cream p-6 shadow-2xl">
            <h2 id="decision-title" className="text-xl">
              {pending.title}
            </h2>

            {pending.needsReason ? (
              <div className="mt-4">
                <label htmlFor="reason" className="mb-1.5 block text-sm font-medium">
                  Reason (they will see this)
                </label>
                <textarea
                  id="reason"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-xl border border-line p-3 text-sm outline-none focus:border-brand"
                  autoFocus
                />
              </div>
            ) : (
              <p className="mt-2 text-sm text-ink/80">They&apos;ll get an email about this.</p>
            )}

            {pending.mentionOrders && (
              <fieldset className="mt-4 space-y-2 text-sm">
                <legend className="mb-1 font-medium">What about their open orders?</legend>
                <label className="flex items-start gap-2.5">
                  <input
                    type="radio"
                    name="orders"
                    className="mt-1 accent-brand"
                    checked={orders === "complete"}
                    onChange={() => setOrders("complete")}
                  />
                  <span>
                    Let them finish.{" "}
                    {u.role === Role.SELLER
                      ? "You'll move the parcels along from the Orders page."
                      : "Orders already placed carry on."}
                  </span>
                </label>
                <label className="flex items-start gap-2.5">
                  <input
                    type="radio"
                    name="orders"
                    className="mt-1 accent-brand"
                    checked={orders === "cancel"}
                    onChange={() => setOrders("cancel")}
                  />
                  <span>
                    Cancel what hasn&apos;t been packed yet and refund it. Anything already packed
                    or shipped carries on.
                  </span>
                </label>
              </fieldset>
            )}

            {problem && (
              <p
                role="alert"
                className="mt-3 rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger"
              >
                {problem}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setPending(null)}>
                Cancel
              </Button>
              <Button
                variant={pending.danger ? "danger" : "primary"}
                loading={decision.isPending}
                onClick={submit}
              >
                {pending.confirm}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
