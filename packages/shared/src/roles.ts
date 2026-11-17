export const Role = {
  CUSTOMER: "customer",
  SELLER: "seller",
  DELIVERY: "delivery",
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin",
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export const ALL_ROLES = Object.values(Role);

// Roles anyone can sign up as. Admin and super admin are never self-registered.
export const SELF_SIGNUP_ROLES = [Role.CUSTOMER, Role.SELLER, Role.DELIVERY] as const;

export const STAFF_ROLES = [Role.ADMIN, Role.SUPER_ADMIN] as const;

export const isStaff = (role: Role) => (STAFF_ROLES as readonly Role[]).includes(role);
