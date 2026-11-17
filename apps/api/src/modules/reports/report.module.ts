import { Router } from "express";
import mongoose, { Schema, model, type Types } from "mongoose";
import { z } from "zod";
import {
  ErrorCode,
  HttpStatus,
  ProductStatus,
  ReportStatus,
  ReportTarget,
  Role,
  reportResolutionSchema,
  reportSchema,
  type ReportDTO,
  type ReportReason,
} from "@lofticore/shared";
import { AppError } from "../../lib/app-error";
import { authenticate, authorize } from "../../middleware/authenticate";
import { requireStaff2fa } from "../../middleware/require-staff-2fa";
import { parsedQuery, validate, validateQuery } from "../../middleware/validate";
import { audit } from "../audit/audit.model";
import { Product } from "../catalog/product.model";
import { notify } from "../notifications/notification.module";
import { Order } from "../orders/order.model";
import { Review, recomputeRating } from "../reviews/review.module";
import { User } from "../users/user.model";

interface ReportShape {
  reporter: Types.ObjectId;
  targetType: ReportTarget;
  targetId: Types.ObjectId;
  reason: ReportReason;
  details: string;
  status: ReportStatus;
  resolutionNote?: string;
  handledBy?: Types.ObjectId;
  createdAt: Date;
}

const reportModelSchema = new Schema<ReportShape>(
  {
    reporter: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    targetType: { type: String, enum: Object.values(ReportTarget), required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    reason: { type: String, required: true },
    details: { type: String, required: true },
    status: {
      type: String,
      enum: Object.values(ReportStatus),
      default: ReportStatus.OPEN,
      index: true,
    },
    resolutionNote: String,
    handledBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);
reportModelSchema.index({ targetType: 1, targetId: 1 });

export const Report = model<ReportShape>("Report", reportModelSchema);

const DAILY_LIMIT = 5;

// A human-readable name for whatever was reported, and proof that it exists.
async function describeTarget(
  type: ReportTarget,
  id: Types.ObjectId | string,
): Promise<string | null> {
  switch (type) {
    case ReportTarget.ORDER:
      return (await Order.findById(id).select("orderNumber"))?.orderNumber ?? null;
    case ReportTarget.PRODUCT:
      return (await Product.findById(id).select("title"))?.title ?? null;
    case ReportTarget.SELLER: {
      const u = await User.findOne({ _id: id, role: Role.SELLER }).select("name");
      return u ? `Seller: ${u.name}` : null;
    }
    case ReportTarget.REVIEW: {
      const r = await Review.findById(id).select("authorName rating");
      return r ? `${r.rating}-star review by ${r.authorName}` : null;
    }
  }
}

async function toDTO(
  r: ReportShape & { _id: Types.ObjectId },
  withReporter = false,
): Promise<ReportDTO> {
  const reporter = withReporter ? await User.findById(r.reporter).select("name email") : null;
  return {
    id: String(r._id),
    targetType: r.targetType,
    targetId: String(r.targetId),
    targetLabel: (await describeTarget(r.targetType, r.targetId)) ?? "(removed)",
    reason: r.reason,
    details: r.details,
    status: r.status,
    resolutionNote: r.resolutionNote ?? undefined,
    createdAt: r.createdAt.toISOString(),
    ...(withReporter
      ? {
          reporter: reporter
            ? { id: String(reporter._id), name: reporter.name, email: reporter.email }
            : undefined,
          reportsOnTarget: await Report.countDocuments({
            targetType: r.targetType,
            targetId: r.targetId,
          }),
        }
      : {}),
  };
}

/* ----------------------------------------------------------------- customers */

export const reportRouter = Router();
reportRouter.use(authenticate);

reportRouter.post("/", validate(reportSchema), async (req, res) => {
  const userId = req.user!.id;
  const { targetType, targetId, reason, details } = req.body;

  if (
    (await Report.countDocuments({
      reporter: userId,
      createdAt: { $gt: new Date(Date.now() - 24 * 3600_000) },
    })) >= DAILY_LIMIT
  ) {
    throw new AppError(
      HttpStatus.TOO_MANY_REQUESTS,
      ErrorCode.REPORT_LIMIT,
      "You've sent a lot of reports today. Please wait a while before sending more.",
    );
  }
  if (!(await describeTarget(targetType, targetId)))
    throw AppError.notFound("We couldn't find what you're reporting.");
  // you can only report an order that's yours
  if (targetType === ReportTarget.ORDER && !(await Order.exists({ _id: targetId, user: userId }))) {
    throw AppError.notFound("We couldn't find what you're reporting.");
  }
  if (
    await Report.exists({
      reporter: userId,
      targetType,
      targetId,
      reason,
      status: ReportStatus.OPEN,
    })
  ) {
    throw AppError.conflict(
      ErrorCode.REPORT_DUPLICATE,
      "You've already reported this for the same reason. We're looking into it.",
    );
  }

  const report = await Report.create({ reporter: userId, targetType, targetId, reason, details });
  await audit({
    action: "report.created",
    actorId: userId,
    targetId: String(report._id),
    meta: { targetType, reason },
    requestId: String(req.id),
  });
  res.status(HttpStatus.CREATED).json({ report: await toDTO(report) });
});

reportRouter.get("/mine", async (req, res) => {
  const rows = await Report.find({ reporter: req.user!.id })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  res.json({ items: await Promise.all(rows.map((r) => toDTO(r))) });
});

/* --------------------------------------------------------------------- admin */

export const adminReportRouter = Router();
adminReportRouter.use(authenticate, authorize(Role.ADMIN, Role.SUPER_ADMIN), requireStaff2fa);

const listQuery = z.object({
  status: z
    .enum([ReportStatus.OPEN, ReportStatus.RESOLVED, ReportStatus.DISMISSED])
    .default(ReportStatus.OPEN),
  page: z.coerce.number().int().min(1).default(1),
});

adminReportRouter.get("/", validateQuery(listQuery), async (_req, res) => {
  const { status, page } = parsedQuery(res, listQuery);
  const limit = 15;
  const [rows, total] = await Promise.all([
    Report.find({ status })
      .sort({ createdAt: status === ReportStatus.OPEN ? 1 : -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Report.countDocuments({ status }),
  ]);
  res.json({
    items: await Promise.all(rows.map((r) => toDTO(r, true))),
    total,
    page,
    pages: Math.ceil(total / limit),
    limit,
  });
});

adminReportRouter.post("/:id/resolve", validate(reportResolutionSchema), async (req, res) => {
  const id = String(req.params.id);
  if (!mongoose.isValidObjectId(id)) throw AppError.notFound();
  const { status, note, action } = req.body;

  // only an open report can be closed, and only once
  const report = await Report.findOneAndUpdate(
    { _id: id, status: ReportStatus.OPEN },
    { status, resolutionNote: note, handledBy: req.user!.id },
    { new: true },
  );
  if (!report)
    throw AppError.conflict(ErrorCode.VALIDATION_FAILED, "This report was already handled.");

  if (action === "hide_review" && report.targetType === ReportTarget.REVIEW) {
    const review = await Review.findByIdAndUpdate(report.targetId, { visible: false });
    if (review) await recomputeRating(review.product);
  }
  if (action === "suspend_product" && report.targetType === ReportTarget.PRODUCT) {
    await Product.updateOne(
      { _id: report.targetId, status: ProductStatus.ACTIVE },
      { status: ProductStatus.SUSPENDED },
    );
  }

  await notify(report.reporter, {
    type: "report.resolved",
    title:
      status === ReportStatus.RESOLVED ? "We looked into your report" : "An update on your report",
    body: note,
  });
  await audit({
    action: `report.${status}`,
    actorId: req.user!.id,
    targetId: id,
    requestId: String(req.id),
    meta: { action, note },
  });
  res.json({ report: await toDTO(report, true) });
});
