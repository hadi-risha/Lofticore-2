// Adds the sample 3D models to products that are already in the database, so the AR
// view can be tried without re-seeding (which would reset products and their ids).
// Run: npm run seed:models -w @lofticore/api
import { logger } from "../config/logger";
import { connectDb, disconnectDb } from "../db/connect";
import { Product } from "../modules/catalog/product.model";
import { sampleModelFor } from "./seed-data";

async function main() {
  await connectDb();
  let updated = 0;
  for (const p of await Product.find({ "model3d.glbUrl": { $exists: false } }).select("title")) {
    const glbUrl = sampleModelFor(p.title);
    if (!glbUrl) continue;
    await Product.updateOne({ _id: p._id }, { model3d: { glbUrl } });
    updated += 1;
  }
  logger.info(`added sample 3D models to ${updated} products`);
}

main()
  .catch((err) => {
    logger.fatal({ err }, "failed");
    process.exitCode = 1;
  })
  .finally(disconnectDb);
