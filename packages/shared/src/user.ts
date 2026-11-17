import type { Role } from "./roles";

export const AccountStatus = {
  ACTIVE: "active",
  // sellers and delivery partners wait here until an admin verifies them
  PENDING_APPROVAL: "pending_approval",
  REJECTED: "rejected",
  BLOCKED: "blocked",
} as const;

export type AccountStatus = (typeof AccountStatus)[keyof typeof AccountStatus];

// What the API returns about a user. Never includes hashes or tokens.
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  status: AccountStatus;
  statusReason?: string;
  emailVerified: boolean;
  tourCompleted: boolean;
  // sellers and delivery partners must submit business details before approval
  profileSubmitted: boolean;
  twoFactorEnabled: boolean;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  user: PublicUser;
}

// Staff with two-factor on get this instead of a session; the code completes the login.
export interface TwoFactorChallenge {
  twoFactorRequired: true;
  challengeToken: string;
}

export interface SessionInfo {
  id: string;
  device: string;
  ip?: string;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}
