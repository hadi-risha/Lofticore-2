// For when the only super admin loses their phone: there is no one left in the app to
// reset it, so this works from the server instead.
// Run: npm run reset-2fa -w @lofticore/api -- owner@yourshop.com
import { logger } from "../config/logger";
import { connectDb, disconnectDb } from "../db/connect";
import { Session } from "../modules/auth/session.model";
import { User } from "../modules/users/user.model";

async function main() {
  const email = process.argv[2]?.toLowerCase();
  if (!email) throw new Error("Usage: npm run reset-2fa -w @lofticore/api -- <email>");

  await connectDb();
  const user = await User.findOne({ email });
  if (!user) throw new Error(`No account with the email ${email}`);

  user.totpEnabled = false;
  user.totpSecret = undefined;
  await user.save();
  await Session.updateMany({ userId: user._id, revokedAt: null }, { revokedAt: new Date() });
  logger.info(`two-factor reset for ${email}. They'll set up a new authenticator at next sign-in.`);
}

main()
  .catch((err) => {
    logger.fatal({ err }, "reset failed");
    process.exitCode = 1;
  })
  .finally(disconnectDb);
