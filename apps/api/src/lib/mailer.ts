import nodemailer from "nodemailer";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { redis } from "./redis";
import { Queue, Worker } from "bullmq";

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

// Tests read this instead of talking to an SMTP server.
export const outbox: Mail[] = [];

const transport =
  env.MAIL_TRANSPORT === "smtp"
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: false,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      })
    : null;

function deliver(mail: Mail) {
  return transport!.sendMail({ from: env.MAIL_FROM, ...mail });
}

// With Redis, mail goes through a job queue: it survives a restart, a failed send is
// retried with a growing delay, and the mail server is never in the request's path.
// Without Redis the send is fire-and-forget (a failure is logged; "resend" recovers it).
const queue = redis && transport ? new Queue<Mail>("mail", { connection: redis }) : null;

export function startMailWorker() {
  if (!redis || !transport) return null;
  const worker = new Worker<Mail>("mail", (job) => deliver(job.data), {
    connection: redis,
    concurrency: 5,
  });
  worker.on("failed", (job, err) =>
    logger.error({ err, to: job?.data.to, attempt: job?.attemptsMade }, "email attempt failed"),
  );
  return worker;
}

export async function sendMail(mail: Mail) {
  if (!transport) {
    outbox.push(mail);
    return;
  }
  if (queue) {
    // not awaited: if Redis is slow or down, the person must not wait on it
    void queue
      .add("send", mail, {
        attempts: 5,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      })
      .catch((err) => logger.error({ err, to: mail.to }, "could not queue email"));
    return;
  }
  deliver(mail).catch((err) => {
    logger.error({ err, to: mail.to, subject: mail.subject }, "failed to send email");
  });
}

export const mailQueue = queue;

type DecisionKind = "approved" | "rejected" | "blocked" | "unblocked";

const DECISION_SUBJECT: Record<DecisionKind, string> = {
  approved: "Your Lofticore account is approved",
  rejected: "An update on your Lofticore application",
  blocked: "Your Lofticore account has been suspended",
  unblocked: "Your Lofticore account is active again",
};

const DECISION_BODY: Record<DecisionKind, string> = {
  approved:
    "Good news - we have verified your details and your account is now active. You can start right away.",
  rejected: "We could not approve your application this time.",
  blocked: "Your account has been suspended.",
  unblocked: "Your account has been restored and you can sign in again.",
};

export const mails = {
  otp: (to: string, name: string, code: string) =>
    sendMail({
      to,
      subject: `${code} is your Lofticore verification code`,
      text: `Hi ${name},\n\nYour verification code is ${code}. It expires in 10 minutes.\n\nIf you didn't create a Lofticore account, you can ignore this email.`,
    }),

  passwordReset: (to: string, name: string, token: string) =>
    sendMail({
      to,
      subject: "Reset your Lofticore password",
      text: `Hi ${name},\n\nUse this link to choose a new password (valid for 30 minutes):\n${env.clientUrl}/reset-password?token=${token}\n\nIf you didn't ask for this, you can ignore this email - your password stays the same.`,
    }),

  decision: (to: string, name: string, kind: DecisionKind, reason?: string) =>
    sendMail({
      to,
      subject: DECISION_SUBJECT[kind],
      text: [
        `Hi ${name},`,
        DECISION_BODY[kind],
        reason ? `Reason: ${reason}` : "",
        kind === "rejected" ? "You can update your details and apply again from your account." : "",
        kind === "blocked" ? "If you think this is a mistake, reply to this email." : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    }),

  staffInvite: (to: string, name: string, token: string) =>
    sendMail({
      to,
      subject: "You've been invited to the Lofticore admin team",
      text: `Hi ${name},\n\nAccept your invitation and set a password (valid for 3 days):\n${env.clientUrl}/accept-invite?token=${token}`,
    }),
};
