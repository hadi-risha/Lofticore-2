import { useEffect, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { bootstrapAuth, startAuthSync } from "@/features/auth/session";
import { queryClient } from "@/lib/query-client";
import { useLiveUpdates } from "@/features/orders/use-live-updates";

// must sit inside QueryClientProvider
function LiveUpdates() {
  useLiveUpdates();
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  // restore the session from the refresh cookie, once, and listen for other tabs
  useEffect(() => {
    startAuthSync();
    void bootstrapAuth();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <LiveUpdates />
      {children}
      <Toaster
        position="top-center"
        richColors
        closeButton
        toastOptions={{ className: "font-sans" }}
      />
    </QueryClientProvider>
  );
}
