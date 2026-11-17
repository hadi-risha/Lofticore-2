import { z } from "zod";
import { SELF_SIGNUP_ROLES } from "./roles";

// Shared by the API (validation) and the web forms (same rules, same messages).

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address.")
  .max(254);

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(128, "That password is too long.")
  .regex(/[A-Za-z]/, "Include at least one letter.")
  .regex(/\d/, "Include at least one number.");

export const nameSchema = z.string().trim().min(2, "Enter your name.").max(80);

export const otpSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit code.");

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(SELF_SIGNUP_ROLES).default("customer"),
});

export const verifyEmailSchema = z.object({
  email: emailSchema,
  code: otpSchema,
});

export const resendOtpSchema = z.object({ email: emailSchema });

export const loginSchema = z.object({
  email: emailSchema,
  // no strength rules on login - old passwords must still work
  password: z.string().min(1, "Enter your password.").max(128),
});

export const googleLoginSchema = z.object({
  idToken: z.string().min(20),
  // only used when the Google account is new
  role: z.enum(SELF_SIGNUP_ROLES).default("customer"),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(20),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export const acceptInviteSchema = z.object({
  token: z.string().min(20),
  name: nameSchema,
  password: passwordSchema,
});

export const inviteStaffSchema = z.object({
  email: emailSchema,
  name: nameSchema,
});

export const updateProfileSchema = z.object({
  name: nameSchema.optional(),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number.")
    .optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
