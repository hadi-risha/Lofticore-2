import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth.store";
import { refreshSession } from "@/lib/api";

// Keeps one server-sent-events connection open while signed in. When the server says an
// order or notification changed, whatever the page shows for them is refetched.
// (fetch, not EventSource: EventSource can't send the Authorization header.)
export function useLiveUpdates() {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  useEffect(() => {
    if (!userId) return;
    const stop = new AbortController();
    let delay = 1000;

    async function connect() {
      while (!stop.signal.aborted) {
        try {
          const res = await fetch("/api/events", {
            headers: { Authorization: `Bearer ${useAuthStore.getState().accessToken}` },
            signal: stop.signal,
          });
          if (res.status === 401) await refreshSession();
          else if (res.ok && res.body) {
            delay = 1000;
            const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value.includes("event: change")) {
                void qc.invalidateQueries({ queryKey: ["orders"] });
                void qc.invalidateQueries({ queryKey: ["notifications"] });
              }
            }
          }
        } catch {
          if (stop.signal.aborted) return;
        }
        // lost the connection: try again, waiting a little longer each time
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, 30_000);
      }
    }
    void connect();
    return () => stop.abort();
  }, [userId, qc]);
}
