// Creates the one super admin. There is no signup route for this role on purpose.
// Run: npm run seed:super-admin -w @lofticore/api
import { AccountStatus, Role } from "@lofticore/shared";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { connectDb, disconnectDb } from "../db/connect";
import { hashPassword } from "../lib/password";
import { User } from "../modules/users/user.model";

async function main() {
  if (!env.SUPER_ADMIN_EMAIL || !env.SUPER_ADMIN_PASSWORD) {
    throw new Error("Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD in apps/api/.env first.");
  }

  await connectDb();

  if (await User.exists({ role: Role.SUPER_ADMIN })) {
    logger.info("a super admin already exists - nothing to do");
    return;
  }

  await User.create({
    name: "Super Admin",
    email: env.SUPER_ADMIN_EMAIL.toLowerCase(),
    passwordHash: await hashPassword(env.SUPER_ADMIN_PASSWORD),
    role: Role.SUPER_ADMIN,
    status: AccountStatus.ACTIVE,
    emailVerified: true,
  });
  logger.info(
    `super admin created: ${env.SUPER_ADMIN_EMAIL}. Change the password after first login.`,
  );
}

main()
  .catch((err) => {
    logger.fatal({ err }, "seeding failed");
    process.exitCode = 1;
  })
  .finally(disconnectDb);
