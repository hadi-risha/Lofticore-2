import mongoose from "mongoose";
import {
  AccountStatus,
  ErrorCode,
  HttpStatus,
  OrderStatus,
  ProductStatus,
  Role,
  UserAction,
  type AdminUserDetail,
  type AdminUserRow,
  type UserProfile,
} from "@lofticore/shared";
import { AppError } from "../../lib/app-error";
import { mails } from "../../lib/mailer";
import { audit } from "../audit/audit.model";
import { notify } from "../notifications/notification.module";
import { revokeAllSessions } from "../auth/auth.service";
import { Product } from "../catalog/product.model";
import { Order } from "../orders/order.model";
import { cancelOrderAsStaff, cancelSellerShipments } from "../orders/order.service";
import { User, type UserDoc } from "../users/user.model";

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const toRow = (u: UserDoc): AdminUserRow => ({
  id: String(u._id),
  name: u.name,
  email: u.email,
  role: u.role,
  status: u.status,
  statusReason: u.statusReason ?? undefined,
  emailVerified: u.emailVerified,
  profileSubmitted: Boolean(u.profile?.submittedAt),
  twoFactorEnabled: u.totpEnabled,
  createdAt: u.createdAt.toISOString(),
});

export async function listUsers(
  filter: { role?: Role; status?: AccountStatus; q?: string; page: number },
  limit = 20,
) {
  const query: Record<string, unknown> = {};
  if (filter.role) query.role = filter.role;
  if (filter.status) query.status = filter.status;
  if (filter.q) {
    const rx = new RegExp(escapeRegex(filter.q), "i");
    query.$or = [{ name: rx }, { email: rx }];
  }
  const [rows, total] = await Promise.all([
    User.find(query)
      .sort({ createdAt: -1 })
      .skip((filter.page - 1) * limit)
      .limit(limit),
    User.countDocuments(query),
  ]);
  return {
    items: rows.map(toRow),
    total,
    page: filter.page,
    pages: Math.ceil(total / limit),
    limit,
  };
}

export async function getUserDetail(id: string): Promise<AdminUserDetail> {
  if (!mongoose.isValidObjectId(id)) throw AppError.notFound("We couldn't find that user.");
  const u = await User.findById(id);
  if (!u) throw AppError.notFound("We couldn't find that user.");

  const open = {
    $nin: [OrderStatus.DELIVERED, OrderStatus.CANCELLED, OrderStatus.PENDING_PAYMENT],
  };
  const [orders, openOrders, products] = await Promise.all([
    u.role === Role.SELLER
      ? Order.countDocuments({ "shipments.seller": u._id })
      : u.role === Role.DELIVERY
        ? Order.countDocuments({ "shipments.agent": u._id })
        : Order.countDocuments({ user: u._id }),
    u.role === Role.SELLER
      ? Order.countDocuments({ "shipments.seller": u._id, status: open })
      : u.role === Role.DELIVERY
        ? Order.countDocuments({ "shipments.agent": u._id, status: open })
        : Order.countDocuments({ user: u._id, status: open }),
    u.role === Role.SELLER ? Product.countDocuments({ seller: u._id }) : Promise.resolve(0),
  ]);

  const profile = u.profile
    ? ({ ...u.profile, submittedAt: u.profile.submittedAt?.toISOString() } as UserProfile)
    : undefined;
  return { ...toRow(u), profile, stats: { orders, openOrders, products } };
}

interface Actor {
  id: string;
  role: Role;
}

const invalid = (message: string) =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.USER_INVALID_TRANSITION, message);

// One entry point for every admin decision about a person, so the rules live in
// exactly one place.
export async function decide(
  actor: Actor,
  targetId: string,
  input: { action: UserAction; reason?: string; activeOrders: "complete" | "cancel" },
  requestId?: string,
) {
  if (!mongoose.isValidObjectId(targetId)) throw AppError.notFound("We couldn't find that user.");
  const target = await User.findById(targetId);
  if (!target) throw AppError.notFound("We couldn't find that user.");

  // who can act on whom
  if (String(target._id) === actor.id)
    throw AppError.forbidden("You can't do that to your own account.");
  if (target.role === Role.SUPER_ADMIN) throw AppError.forbidden();
  if (target.role === Role.ADMIN && actor.role !== Role.SUPER_ADMIN)
    throw AppError.forbidden("Only the super admin can manage admins.");

  const { action, reason } = input;
  const needsApproval = target.role === Role.SELLER || target.role === Role.DELIVERY;
  let mailKind: "approved" | "rejected" | "blocked" | "unblocked";
  let cancelled = 0;

  switch (action) {
    case UserAction.APPROVE: {
      if (!needsApproval) throw invalid("Only sellers and delivery partners need approval.");
      if (
        target.status !== AccountStatus.PENDING_APPROVAL &&
        target.status !== AccountStatus.REJECTED
      ) {
        throw invalid("This account isn't waiting for approval.");
      }
      if (!target.profile?.submittedAt) {
        throw new AppError(
          HttpStatus.CONFLICT,
          ErrorCode.USER_PROFILE_INCOMPLETE,
          "They haven't submitted their business details yet.",
        );
      }
      target.status = AccountStatus.ACTIVE;
      target.approvedAt = new Date();
      target.statusReason = undefined;
      mailKind = "approved";
      break;
    }
    case UserAction.REJECT: {
      if (!needsApproval) throw invalid("Only sellers and delivery partners can be rejected.");
      if (target.status !== AccountStatus.PENDING_APPROVAL)
        throw invalid("This account isn't waiting for approval.");
      target.status = AccountStatus.REJECTED;
      target.statusReason = reason;
      mailKind = "rejected";
      break;
    }
    case UserAction.BLOCK: {
      if (target.status === AccountStatus.BLOCKED)
        throw invalid("This account is already blocked.");
      target.status = AccountStatus.BLOCKED;
      target.statusReason = reason;
      mailKind = "blocked";
      break;
    }
    case UserAction.UNBLOCK: {
      if (target.status !== AccountStatus.BLOCKED) throw invalid("This account isn't blocked.");
      // someone who was never approved goes back to the queue, not straight to work
      target.status =
        needsApproval && !target.approvedAt ? AccountStatus.PENDING_APPROVAL : AccountStatus.ACTIVE;
      target.statusReason = undefined;
      mailKind = "unblocked";
      break;
    }
  }

  await target.save();

  if (action === UserAction.BLOCK) {
    // out of every device, right now
    await revokeAllSessions(String(target._id));

    if (target.role === Role.SELLER) {
      await Product.updateMany(
        { seller: target._id, status: ProductStatus.ACTIVE },
        { status: ProductStatus.SUSPENDED },
      );
      if (input.activeOrders === "cancel")
        cancelled = await cancelSellerShipments(
          String(target._id),
          actor.id,
          `Seller suspended: ${reason}`,
        );
    }
    if (target.role === Role.CUSTOMER && input.activeOrders === "cancel") {
      const open = await Order.find({
        user: target._id,
        status: { $in: [OrderStatus.PENDING_PAYMENT, OrderStatus.PLACED, OrderStatus.PROCESSING] },
      }).select("_id");
      for (const o of open) {
        try {
          if (
            await cancelOrderAsStaff(
              String(o._id),
              actor.id,
              `Account suspended: ${reason}`,
              requestId,
            )
          )
            cancelled += 1;
        } catch {
          // already packed or shipped: that order carries on to delivery
        }
      }
    }
  }
  if (action === UserAction.UNBLOCK && target.role === Role.SELLER) {
    await Product.updateMany(
      { seller: target._id, status: ProductStatus.SUSPENDED },
      { status: ProductStatus.ACTIVE },
    );
  }

  await mails.decision(target.email, target.name, mailKind, reason);
  await notify(target._id, {
    type: `account.${mailKind}`,
    title: {
      approved: "You're approved!",
      rejected: "About your application",
      blocked: "Your account was suspended",
      unblocked: "Your account is active again",
    }[mailKind],
    body: reason,
    link:
      target.role === Role.SELLER
        ? "/seller"
        : target.role === Role.DELIVERY
          ? "/delivery"
          : undefined,
  });
  await audit({
    action: `user.${action}`,
    actorId: actor.id,
    targetId: String(target._id),
    requestId,
    meta: { reason, activeOrders: input.activeOrders, cancelled },
  });

  return { user: toRow(target), cancelledOrders: cancelled };
}

export async function resetTwoFactor(actorId: string, targetId: string, requestId?: string) {
  const target = await User.findById(targetId);
  if (!target || (target.role !== Role.ADMIN && target.role !== Role.SUPER_ADMIN))
    throw AppError.notFound("We couldn't find that team member.");
  if (String(target._id) === actorId)
    throw AppError.forbidden("Ask another super admin or use the command line to reset your own.");

  target.totpEnabled = false;
  target.totpSecret = undefined;
  await target.save();
  // they must sign in again and set up a new authenticator
  await revokeAllSessions(String(target._id));
  await audit({ action: "staff.2fa_reset", actorId, targetId, requestId });
}
