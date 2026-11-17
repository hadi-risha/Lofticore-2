import { useMutation } from "@tanstack/react-query";
import type { AuthResponse, PublicUser, Role, TwoFactorChallenge } from "@lofticore/shared";
import { api } from "@/lib/api";

// Auth calls never retry a refresh (auth: false) and report errors in their own
// form, so they opt out of the global error toast with meta.silent.
const call = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", body, auth: false });
const silent = { silent: true } as const;

export const useRegister = () =>
  useMutation({
    mutationFn: (v: { name: string; email: string; password: string; role: Role }) =>
      call<{ message: string }>("/auth/register", v),
    meta: silent,
  });

export const useVerifyEmail = () =>
  useMutation({
    mutationFn: (v: { email: string; code: string }) => call<AuthResponse>("/auth/verify-email", v),
    meta: silent,
  });

export const useResendOtp = () =>
  useMutation({
    mutationFn: (v: { email: string }) => call<{ message: string }>("/auth/resend-otp", v),
    meta: silent,
  });

export const useLogin = () =>
  useMutation({
    mutationFn: (v: { email: string; password: string }) =>
      call<AuthResponse | TwoFactorChallenge>("/auth/login", v),
    meta: silent,
  });

export const useGoogleLogin = () =>
  useMutation({
    mutationFn: (v: { idToken: string; role: Role }) => call<AuthResponse>("/auth/google", v),
    meta: silent,
  });

export const useForgotPassword = () =>
  useMutation({
    mutationFn: (v: { email: string }) => call<{ message: string }>("/auth/forgot-password", v),
    meta: silent,
  });

export const useResetPassword = () =>
  useMutation({
    mutationFn: (v: { token: string; password: string }) =>
      call<{ message: string }>("/auth/reset-password", v),
    meta: silent,
  });

/* ---------------------------------------------------- team accounts (staff) */

export const useLoginTwoFactor = () =>
  useMutation({
    mutationFn: (v: { challengeToken: string; code: string }) =>
      call<AuthResponse>("/auth/login/2fa", v),
    meta: silent,
  });

export const useAcceptInvite = () =>
  useMutation({
    mutationFn: (v: { token: string; name: string; password: string }) =>
      call<AuthResponse>("/auth/accept-invite", v),
    meta: silent,
  });

export interface TwoFactorSetup {
  secret: string;
  otpauthUrl: string;
  qr: string;
}

export const useBeginTwoFactor = () =>
  useMutation({ mutationFn: () => api<TwoFactorSetup>("/auth/2fa/setup", { method: "POST" }) });

export const useEnableTwoFactor = () =>
  useMutation({
    mutationFn: (code: string) =>
      api<{ user: PublicUser }>("/auth/2fa/enable", { method: "POST", body: { code } }),
    meta: silent,
  });
