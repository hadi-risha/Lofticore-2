import { Router } from "express";
import {
  HttpStatus,
  Role,
  AccountStatus,
  deliveryProfileSchema,
  sellerProfileSchema,
  updateProfileSchema,
} from "@lofticore/shared";
import { AppError } from "../../lib/app-error";
import { authenticate } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import { audit } from "../audit/audit.model";
import { User, toPublicUser } from "./user.model";

export const userRouter = Router();

userRouter.use(authenticate);

userRouter.get("/me", async (req, res) => {
  const user = await User.findById(req.user!.id);
  if (!user) throw AppError.unauthenticated();
  res.json({ user: toPublicUser(user) });
});

userRouter.patch("/me", validate(updateProfileSchema), async (req, res) => {
  const user = await User.findByIdAndUpdate(req.user!.id, req.body, { new: true });
  if (!user) throw AppError.unauthenticated();
  res.json({ user: toPublicUser(user) });
});

// the first-login tour calls this when it's finished or skipped
userRouter.post("/me/tour-complete", async (req, res) => {
  const user = await User.findByIdAndUpdate(req.user!.id, { tourCompleted: true }, { new: true });
  if (!user) throw AppError.unauthenticated();
  res.json({ user: toPublicUser(user) });
});

/* ---------------------------------------------------- business details */

// Sellers and delivery partners send the details an admin checks before approving.
// Sending them again after a rejection puts the account back in the review queue.
userRouter.get("/me/profile", async (req, res) => {
  const user = await User.findById(req.user!.id);
  if (!user) throw AppError.unauthenticated();
  res.json({ profile: user.profile ?? null });
});

userRouter.put("/me/profile", async (req, res) => {
  const user = await User.findById(req.user!.id);
  if (!user) throw AppError.unauthenticated();

  const schema =
    user.role === Role.SELLER
      ? sellerProfileSchema
      : user.role === Role.DELIVERY
        ? deliveryProfileSchema
        : null;
  if (!schema)
    throw AppError.forbidden("Only sellers and delivery partners have business details.");
  if (user.status === AccountStatus.BLOCKED) throw AppError.forbidden("This account is suspended.");

  const details = schema.parse(req.body);
  user.profile = { ...details, submittedAt: new Date() };
  if (user.status === AccountStatus.REJECTED) {
    user.status = AccountStatus.PENDING_APPROVAL;
    user.statusReason = undefined;
  }
  await user.save();
  await audit({
    action: "user.profile_submitted",
    actorId: String(user._id),
    requestId: String(req.id),
  });
  res.status(HttpStatus.OK).json({ user: toPublicUser(user) });
});
