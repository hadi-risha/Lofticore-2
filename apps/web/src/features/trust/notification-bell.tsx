import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { cn } from "@/lib/cn";
import { useNotifications, useReadNotifications } from "./api";

const ago = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

export function NotificationBell() {
  const { data } = useNotifications();
  const read = useReadNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = data?.unread ?? 0;

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-tour="bell"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        className="relative grid size-10 place-items-center rounded-full hover:bg-brand-soft"
      >
        <Bell className="size-5" aria-hidden />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] font-bold leading-5 text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-[22rem] max-w-[92vw] overflow-hidden rounded-2xl border border-line bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-semibold">Notifications</p>
            {unread > 0 && (
              <button
                className="text-xs text-brand hover:underline"
                onClick={() => read.mutate(undefined)}
              >
                Mark all as read
              </button>
            )}
          </div>
          <ul className="max-h-96 divide-y divide-line overflow-y-auto">
            {data?.items.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-muted">
                Nothing yet. We&apos;ll tell you when something happens.
              </li>
            )}
            {data?.items.map((n) => {
              const inner = (
                <>
                  <span
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      n.read ? "bg-transparent" : "bg-gold",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm", !n.read && "font-semibold")}>
                      {n.title}
                    </span>
                    {n.body && <span className="mt-0.5 block text-xs text-muted">{n.body}</span>}
                    <span className="mt-1 block text-[11px] text-muted">{ago(n.createdAt)}</span>
                  </span>
                </>
              );
              const onClick = () => {
                if (!n.read) read.mutate(n.id);
                setOpen(false);
              };
              return (
                <li key={n.id}>
                  {n.link ? (
                    <Link
                      to={n.link}
                      onClick={onClick}
                      className="flex gap-3 px-4 py-3 hover:bg-brand-soft/60"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <button
                      onClick={onClick}
                      className="flex w-full gap-3 px-4 py-3 text-left hover:bg-brand-soft/60"
                    >
                      {inner}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
