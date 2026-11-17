// Wipes the end-to-end test database so every run starts clean. It only ever touches a
// database whose name ends in "-e2e", so it can't be pointed at real data by mistake.
import mongoose from "mongoose";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { connectDb, disconnectDb } from "../db/connect";

async function main() {
  await connectDb();
  const name = mongoose.connection.name;
  if (!name.endsWith("-e2e")) {
    throw new Error(`Refusing to wipe "${name}": the end-to-end database name must end in -e2e.`);
  }
  await mongoose.connection.dropDatabase();
  logger.info(`dropped ${name} (${env.NODE_ENV})`);
}

main()
  .catch((err) => {
    logger.fatal({ err }, "e2e reset failed");
    process.exitCode = 1;
  })
  .finally(disconnectDb);
