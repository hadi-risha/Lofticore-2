import { useState } from "react";
import { Pagination, Skeleton } from "@/components/ui/bits";
import { useAuditLog } from "../api";
import { FilterTabs, PageHeader, Table, Td, when } from "../ui";

const TABS = [
  { value: "", label: "Everything" },
  { value: "user.", label: "People" },
  { value: "auth.", label: "Sign-ins" },
  { value: "order.", label: "Orders" },
  { value: "payment.", label: "Payments" },
  { value: "catalog.", label: "Products" },
];

export function AdminAuditPage() {
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAuditLog(action || undefined, page);

  return (
    <div>
      <PageHeader
        title="Activity log"
        subtitle="Who did what, and when. Entries can't be edited or deleted."
      />
      <FilterTabs
        options={TABS}
        value={action}
        onChange={(v) => {
          setAction(v);
          setPage(1);
        }}
      />

      <div className="mt-5">
        {isLoading ? (
          <Skeleton className="h-64" />
        ) : (
          <Table head={["When", "Action", "By", "Details"]}>
            {data?.items.map((e) => (
              <tr key={e.id}>
                <Td className="whitespace-nowrap text-muted">{when(e.at)}</Td>
                <Td className="font-mono text-xs">{e.action}</Td>
                <Td>
                  {e.actor ? (
                    <>
                      <span className="font-medium">{e.actor.name}</span>
                      <span className="block text-xs text-muted">{e.actor.email}</span>
                    </>
                  ) : (
                    <span className="text-muted">System</span>
                  )}
                </Td>
                <Td className="max-w-[260px] truncate text-xs text-muted">
                  {e.meta ? JSON.stringify(e.meta) : ""}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </div>
      {data && <Pagination page={data.page} pages={data.pages} onChange={setPage} />}
    </div>
  );
}
