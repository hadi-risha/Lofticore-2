import mongoose from "mongoose";
import { env } from "../config/env";
import { logger } from "../config/logger";

export async function connectDb() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  logger.info("mongo connected");
}

export async function disconnectDb() {
  await mongoose.disconnect();
}

// 1 = connected
export const isDbReady = () => mongoose.connection.readyState === 1;
