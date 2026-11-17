import { MutationCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "./api";

// Quote this when something breaks: it finds the exact server log lines.
export function errorMessage(err: unknown) {
  if (err instanceof ApiError) {
    return err.requestId && err.status >= 500
      ? `${err.message} (ref ${err.requestId.slice(0, 8)})`
      : err.message;
  }
  return "Something went wrong. Please try again.";
}

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: {
      // set when the form shows the error itself and a toast would be a duplicate
      silent?: boolean;
    };
  }
}

export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    // every failed action gets a toast, unless the caller opts out
    onError: (err, _vars, _ctx, mutation) => {
      if (!mutation.meta?.silent) toast.error(errorMessage(err));
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      // retrying a 404 or 403 just wastes time; only retry network and server errors
      retry: (count, err) =>
        err instanceof ApiError && err.status > 0 && err.status < 500 ? false : count < 2,
    },
  },
});
