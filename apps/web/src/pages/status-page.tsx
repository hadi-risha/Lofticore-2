import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleSlash, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Skeleton } from "@/components/ui/bits";

interface Check {
  name: string;
  state: "up" | "down" | "off";
  latencyMs?: number;
  detail?: string;
}

interface Status {
  status: "operational" | "degraded";
  checkedAt: string;
  uptimeSeconds: number;
  memoryMb: number;
  node: string;
  checks: Check[];
  mailQueue?: Record<string, number>;
}

const uptime = (s: number) =>
  s < 3600
    ? `${Math.floor(s / 60)} min`
    : `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;

// A public health page: the same checks a load balancer would run, readable by people.
export function StatusPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["status"],
    queryFn: () => api<Status>("/status", { auth: false }),
    refetchInterval: 10_000,
    retry: false,
  });

  const icon = (s: Check["state"]) =>
    s === "up" ? (
      <CheckCircle2 className="size-5 text-success" aria-label="up" />
    ) : s === "down" ? (
      <XCircle className="size-5 text-danger" aria-label="down" />
    ) : (
      <CircleSlash className="size-5 text-muted" aria-label="not in use" />
    );

  return (
    <div className="container-page max-w-2xl py-12">
      <h1 className="text-3xl">System status</h1>
      {isLoading ? (
        <Skeleton className="mt-6 h-64" />
      ) : isError || !data ? (
        <p
          className="mt-6 rounded-2xl border border-danger/30 bg-danger/5 p-5 text-danger"
          role="alert"
        >
          We can&apos;t reach the server right now.
        </p>
      ) : (
        <>
          <p
            className={cn(
              "mt-4 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium",
              data.status === "operational"
                ? "bg-success/10 text-success"
                : "bg-danger/10 text-danger",
            )}
            role="status"
          >
            {data.status === "operational"
              ? "All systems operational"
              : "Some systems are degraded"}
          </p>
          <ul className="mt-6 divide-y divide-line rounded-2xl border border-line bg-white">
            {data.checks.map((c) => (
              <li key={c.name} className="flex items-center gap-3 px-5 py-4">
                {icon(c.state)}
                <div className="flex-1">
                  <p className="font-medium">{c.name}</p>
                  {c.detail && <p className="text-xs text-muted">{c.detail}</p>}
                </div>
                <span className="text-sm text-muted">
                  {c.state === "up"
                    ? `${c.latencyMs} ms`
                    : c.state === "off"
                      ? "not in use"
                      : "down"}
                </span>
              </li>
            ))}
          </ul>
          <dl className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            {[
              ["Uptime", uptime(data.uptimeSeconds)],
              ["Memory", `${data.memoryMb} MB`],
              ["Node", data.node],
              ["Email queue", data.mailQueue ? `${data.mailQueue.waiting ?? 0} waiting` : "direct"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-line bg-white p-4">
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="mt-1 font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-muted">
            Refreshes every 10 seconds · API reference at{" "}
            <a className="underline" href="/api/docs">
              /api/docs
            </a>
          </p>
        </>
      )}
    </div>
  );
}
