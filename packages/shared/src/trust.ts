import { z } from "zod";

/* ------------------------------------------------------------------ reviews */

export const reviewSchema = z.object({
  rating: z.number().int().min(1, "Choose a star rating.").max(5),
  title: z
    .string()
    .trim()
    .max(80)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  body: z.string().trim().min(10, "Tell others a bit more - at least a sentence.").max(2000),
});
export type ReviewInput = z.infer<typeof reviewSchema>;

export const reviewQuerySchema = z.object({
  sort: z.enum(["newest", "helpful", "highest", "lowest"]).default("helpful"),
  page: z.coerce.number().int().min(1).default(1),
});

export interface ReviewDTO {
  id: string;
  rating: number;
  title?: string;
  body: string;
  author: string; // "Maya I."
  createdAt: string;
  helpfulCount: number;
  helpfulByMe: boolean;
  mine: boolean;
  // false when an admin has hidden it (only the author sees their own hidden review)
  visible: boolean;
}

export interface ReviewSummary {
  average: number;
  count: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export interface ReviewEligibility {
  // bought it and it arrived
  eligible: boolean;
  alreadyReviewed: boolean;
  myReview?: ReviewDTO;
}

/* ------------------------------------------------------------------ reports */

export const ReportTarget = {
  ORDER: "order",
  PRODUCT: "product",
  SELLER: "seller",
  REVIEW: "review",
} as const;
export type ReportTarget = (typeof ReportTarget)[keyof typeof ReportTarget];

export const REPORT_REASONS = {
  counterfeit: "Counterfeit or fake",
  not_as_described: "Not as described",
  not_delivered: "Never arrived",
  damaged: "Arrived damaged",
  scam: "Looks like a scam",
  abusive: "Abusive or inappropriate",
  other: "Something else",
} as const;
export type ReportReason = keyof typeof REPORT_REASONS;

export const ReportStatus = {
  OPEN: "open",
  RESOLVED: "resolved",
  DISMISSED: "dismissed",
} as const;
export type ReportStatus = (typeof ReportStatus)[keyof typeof ReportStatus];

export const reportSchema = z.object({
  targetType: z.enum(Object.values(ReportTarget) as [ReportTarget, ...ReportTarget[]]),
  targetId: z.string().regex(/^[a-f\d]{24}$/i, "Choose what you're reporting."),
  reason: z.enum(Object.keys(REPORT_REASONS) as [ReportReason, ...ReportReason[]]),
  details: z
    .string()
    .trim()
    .min(10, "Please describe what happened - at least a sentence.")
    .max(1500),
});
export type ReportInput = z.infer<typeof reportSchema>;

export const reportResolutionSchema = z.object({
  status: z.enum([ReportStatus.RESOLVED, ReportStatus.DISMISSED]),
  note: z.string().trim().min(3, "Leave a note - the reporter will see it.").max(500),
  // optional one-click follow-up
  action: z.enum(["none", "hide_review", "suspend_product"]).default("none"),
});

export interface ReportDTO {
  id: string;
  targetType: ReportTarget;
  targetId: string;
  targetLabel: string;
  reason: ReportReason;
  details: string;
  status: ReportStatus;
  resolutionNote?: string;
  createdAt: string;
  reporter?: { id: string; name: string; email: string };
  // how many reports this same target has - a quick risk signal for admins
  reportsOnTarget?: number;
}

/* ------------------------------------------------------------ notifications */

export interface NotificationDTO {
  id: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  read: boolean;
  createdAt: string;
}
