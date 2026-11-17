import { ErrorCode, type ApiErrorBody, type AuthResponse } from "@lofticore/shared";
import { useAuthStore } from "@/stores/auth.store";

// One place that talks to the API: attaches the access token, refreshes it when
// it expires, and turns every failure into an ApiError the UI can show.

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode | "NETWORK",
    message: string,
    public readonly fields?: Record<string, string>,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

interface Options {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Query;
  // false for login/register etc., which must not trigger a token refresh
  auth?: boolean;
  signal?: AbortSignal;
}

export const buildQuery = (query?: Query) => {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
};

async function send<T>(path: string, opts: Options, token: string | null): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}${buildQuery(opts.query)}`, {
      method: opts.method ?? "GET",
      credentials: "include",
      signal: opts.signal,
      headers: {
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        // the API requires this on cookie endpoints; browsers can't send it cross-site
        "X-Requested-By": "lofticore",
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(
      0,
      "NETWORK",
      "We can't reach the server. Check your connection and try again.",
    );
  }

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data as Partial<ApiErrorBody> | null;
    throw new ApiError(
      res.status,
      err?.code ?? ErrorCode.INTERNAL,
      err?.message ?? "Something went wrong. Please try again.",
      err?.fields,
      err?.requestId ?? res.headers.get("x-request-id") ?? undefined,
    );
  }
  return data as T;
}

/* ------------------------------------------------------------ token refresh */

// If five requests fail at once because the token just expired, only one refresh
// goes out and they all wait for it.
let refreshing: Promise<boolean> | null = null;

export function refreshSession(): Promise<boolean> {
  refreshing ??= send<AuthResponse>("/auth/refresh", { method: "POST" }, null)
    .then((res) => {
      useAuthStore.getState().setSession(res.user, res.accessToken);
      return true;
    })
    .catch(() => {
      useAuthStore.getState().clear();
      return false;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const useToken = opts.auth !== false;
  try {
    return await send<T>(path, opts, useToken ? useAuthStore.getState().accessToken : null);
  } catch (err) {
    const expired = err instanceof ApiError && err.code === ErrorCode.AUTH_TOKEN_EXPIRED;
    if (useToken && expired && (await refreshSession())) {
      return send<T>(path, opts, useAuthStore.getState().accessToken);
    }
    throw err;
  }
}
