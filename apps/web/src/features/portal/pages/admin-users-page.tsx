import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ALL_ROLES } from "@lofticore/shared";
import { EmptyState, Pagination, Skeleton } from "@/components/ui/bits";
import { useDebounced } from "@/hooks/use-debounced";
import { useAdminUsers } from "../api";
import { PageHeader, Pill, Table, Td, prettyStatus, statusTone, when } from "../ui";

const STATUSES = ["active", "pending_approval", "rejected", "blocked"];

const selectClass =
  "h-10 rounded-full border border-line bg-white px-3.5 text-sm outline-none focus:border-brand";

export function AdminUsersPage() {
  const [params, setParams] = useSearchParams();
  const role = params.get("role") ?? "";
  const status = params.get("status") ?? "";
  const page = Number(params.get("page")) || 1;
  const [text, setText] = useState("");
  const q = useDebounced(text, 300);
  const { data, isLoading } = useAdminUsers({
    role: role || undefined,
    status: status || undefined,
    q: q || undefined,
    page,
  });

  const set = (patch: Record<string, string>) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (!("page" in patch)) next.delete("page");
      return next;
    });

  return (
    <div>
      <PageHeader title="People" subtitle="Customers, sellers, delivery partners and the team." />

      <div className="mb-5 flex flex-wrap gap-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search name or email"
          aria-label="Search people"
          className={`${selectClass} w-full sm:w-64`}
        />
        <select
          value={role}
          onChange={(e) => set({ role: e.target.value })}
          aria-label="Filter by role"
          className={selectClass}
        >
          <option value="">All roles</option>
          {ALL_ROLES.map((r) => (
            <option key={r} value={r}>
              {prettyStatus(r)}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => set({ status: e.target.value })}
          aria-label="Filter by status"
          className={selectClass}
        >
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {prettyStatus(s)}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : data?.items.length === 0 ? (
        <EmptyState title="Nobody matches those filters" />
      ) : (
        <Table head={["Name", "Role", "Status", "Joined", ""]}>
          {data?.items.map((u) => (
            <tr key={u.id}>
              <Td>
                <p className="font-medium">{u.name}</p>
                <p className="text-xs text-muted">{u.email}</p>
              </Td>
              <Td>{prettyStatus(u.role)}</Td>
              <Td>
                <Pill tone={statusTone(u.status)}>{prettyStatus(u.status)}</Pill>
                {u.status === "pending_approval" && !u.profileSubmitted && (
                  <p className="mt-1 text-xs text-muted">No details yet</p>
                )}
              </Td>
              <Td className="text-muted">{when(u.createdAt)}</Td>
              <Td className="text-right">
                <Link
                  to={`/admin/users/${u.id}`}
                  className="font-medium text-brand hover:underline"
                >
                  Open
                </Link>
              </Td>
            </tr>
          ))}
        </Table>
      )}
      {data && (
        <Pagination
          page={data.page}
          pages={data.pages}
          onChange={(p) => set({ page: String(p) })}
        />
      )}
    </div>
  );
}
