// Fills the database with sample categories and products for development.
// Run: npm run seed:catalog -w @lofticore/api          (add --reset to start over)
import { AccountStatus, ProductStatus, Role } from "@lofticore/shared";
import { logger } from "../config/logger";
import { connectDb, disconnectDb } from "../db/connect";
import { hashPassword } from "../lib/password";
import { slugify } from "../lib/slug";
import { Category } from "../modules/catalog/category.model";
import { Product } from "../modules/catalog/product.model";
import { StockMovement } from "../modules/inventory/inventory.model";
import { User } from "../modules/users/user.model";
import { sampleModelFor, seedCategories, seedCategoryPics, seedProducts } from "./seed-data";

const SELLER_EMAIL = "studio@lofticore.local";
const SELLER_PASSWORD = "Seller12345";

// Same numbers every run, so screenshots and tests stay stable.
const pic = (name: string) =>
  seedCategoryPics[name] ? `/static/seed/pic${seedCategoryPics[name]}.jpeg` : undefined;

const pseudo = (n: number, mod: number) => ((n * 7919 + 13) % 9973) % mod;

async function main() {
  await connectDb();

  if (process.argv.includes("--reset")) {
    await Promise.all([
      Product.deleteMany({}),
      Category.deleteMany({}),
      StockMovement.deleteMany({}),
    ]);
    logger.info("cleared products and categories");
  } else if (await Product.exists({})) {
    logger.info("catalogue already has products - run with --reset to start over");
    return;
  }

  const seller =
    (await User.findOne({ email: SELLER_EMAIL })) ??
    (await User.create({
      name: "Lofticore Studio",
      email: SELLER_EMAIL,
      passwordHash: await hashPassword(SELLER_PASSWORD),
      role: Role.SELLER,
      status: AccountStatus.ACTIVE,
      emailVerified: true,
    }));

  const byName = new Map<string, string>();
  let order = 0;
  for (const parent of seedCategories) {
    const p = await Category.create({
      name: parent.name,
      slug: slugify(parent.name),
      image: pic(parent.name),
      order: order++,
    });
    byName.set(parent.name, String(p._id));
    for (const child of parent.children ?? []) {
      const c = await Category.create({
        name: child,
        slug: slugify(child),
        parent: p._id,
        image: pic(child),
        order: order++,
      });
      byName.set(child, String(c._id));
    }
  }

  const movements: Record<string, unknown>[] = [];

  for (const [i, s] of seedProducts.entries()) {
    const isFurniture = [
      "Sofas & Seating",
      "Tables",
      "Storage & Shelves",
      "Dining",
      "Bedroom",
    ].includes(s.category);
    const price = s.price * 100;
    const mrp = Math.round((price * (1.12 + pseudo(i, 25) / 100)) / 100) * 100;
    const base = `LC-${String(s.pic).padStart(3, "0")}`;

    const variants = [
      {
        sku: `${base}-A`,
        color: s.color,
        material: s.material,
        price,
        mrp,
        available: 6 + pseudo(i + 1, 30),
        reserved: 0,
        lowStockThreshold: 5,
      },
    ];
    // furniture also comes in a second finish
    if (isFurniture) {
      variants.push({
        sku: `${base}-B`,
        color: "Charcoal",
        material: s.material,
        price: Math.round((price * 1.08) / 100) * 100,
        mrp: Math.round((mrp * 1.08) / 100) * 100,
        available: 3 + pseudo(i + 2, 15),
        reserved: 0,
        lowStockThreshold: 5,
      });
    }

    const sold = pseudo(i + 3, 400);
    const prices = variants.map((v) => v.price);
    const product = await Product.create({
      seller: seller._id,
      title: s.title,
      slug: slugify(s.title),
      description: s.blurb,
      category: byName.get(s.category),
      brand: "Lofticore",
      material: s.material,
      tags: s.tags,
      images: [{ url: `/static/seed/pic${s.pic}.jpeg`, alt: s.title }],
      model3d: sampleModelFor(s.title) ? { glbUrl: sampleModelFor(s.title) } : undefined,
      dimensions: { widthCm: s.dims[0], depthCm: s.dims[1], heightCm: s.dims[2] },
      variants,
      status: ProductStatus.ACTIVE,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      maxMrp: Math.max(...variants.map((v) => v.mrp)),
      inStock: true,
      soldCount: sold,
      ratingAvg: Number((3.8 + pseudo(i + 4, 11) / 10).toFixed(1)),
      ratingCount: 4 + Math.round(sold / 6),
    });

    for (const v of variants) {
      movements.push({
        product: product._id,
        sku: v.sku,
        delta: v.available,
        reason: "restock",
        actor: seller._id,
        note: "seed",
      });
    }
  }
  await StockMovement.insertMany(movements);

  logger.info(`seeded ${seedProducts.length} products in ${byName.size} categories`);
  logger.info(`seller login: ${SELLER_EMAIL} / ${SELLER_PASSWORD}`);
}

main()
  .catch((err) => {
    logger.fatal({ err }, "seeding failed");
    process.exitCode = 1;
  })
  .finally(disconnectDb);
