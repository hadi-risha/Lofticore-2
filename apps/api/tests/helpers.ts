import mongoose from "mongoose";
import request from "supertest";
import { AccountStatus, ProductStatus, Role } from "@lofticore/shared";
import type { Express } from "express";
import { hashPassword } from "../src/lib/password";
import { Category } from "../src/modules/catalog/category.model";
import { Product } from "../src/modules/catalog/product.model";
import { clearCategoryCache } from "../src/modules/catalog/category.service";
import { Reservation, StockMovement } from "../src/modules/inventory/inventory.model";
import { Address } from "../src/modules/addresses/address.module";
import { Wishlist } from "../src/modules/wishlist/wishlist.module";
import { Order, Payment } from "../src/modules/orders/order.model";
import { Review } from "../src/modules/reviews/review.module";
import { Report } from "../src/modules/reports/report.module";
import { Notification } from "../src/modules/notifications/notification.module";
import { User } from "../src/modules/users/user.model";
import { totpNow } from "../src/lib/totp";
import { isStaff } from "@lofticore/shared";

export const PASSWORD = "Sofa12345";
export const TEST_TOTP_SECRET = "JBSWY3DPEHPK3PXP";

export async function resetDb() {
  clearCategoryCache();
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
}

// make sure unique + text indexes exist before the first insert
export const ensureIndexes = () =>
  Promise.all([
    Product.init(),
    Category.init(),
    User.init(),
    StockMovement.init(),
    Reservation.init(),
    Address.init(),
    Wishlist.init(),
    Order.init(),
    Payment.init(),
    Review.init(),
    Report.init(),
    Notification.init(),
  ]);

export async function makeUser(
  email: string,
  role: Role = Role.CUSTOMER,
  status: AccountStatus = AccountStatus.ACTIVE,
  // test accounts look established by default, so the new-account limits stay out of the way
  ageDays = 30,
) {
  return User.create({
    createdAt: new Date(Date.now() - ageDays * 24 * 3600_000),
    name: email.split("@")[0]!,
    email,
    passwordHash: await hashPassword(PASSWORD),
    role,
    status,
    emailVerified: true,
    // staff come with their authenticator already set up, like real ones must
    ...(isStaff(role) ? { totpEnabled: true, totpSecret: TEST_TOTP_SECRET } : {}),
  });
}

export async function tokenFor(app: Express, email: string) {
  const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
  if (res.body.twoFactorRequired) {
    const second = await request(app)
      .post("/api/auth/login/2fa")
      .send({ challengeToken: res.body.challengeToken, code: totpNow(TEST_TOTP_SECRET) });
    return second.body.accessToken as string;
  }
  return res.body.accessToken as string;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function makeCategory(name: string, parent?: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const c = await Category.create({ name, slug, parent: parent ?? null });
  clearCategoryCache();
  return c;
}

interface ProductOpts {
  title: string;
  category: string;
  seller: string;
  price?: number; // rupees
  stock?: number;
  sold?: number;
  rating?: number;
  material?: string;
  color?: string;
  tags?: string[];
  status?: ProductStatus;
  sku?: string;
}

// Inserts straight into the database; use the API in the tests that are about the API.
export async function makeProduct(o: ProductOpts) {
  const price = (o.price ?? 10000) * 100;
  const stock = o.stock ?? 10;
  const sku =
    o.sku ??
    `SKU-${o.title
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 8)
      .toUpperCase()}-${Math.floor(Math.random() * 1e6)}`;
  return Product.create({
    seller: o.seller,
    title: o.title,
    slug: o.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Math.floor(Math.random() * 1e4),
    description: `${o.title} - a test product with a long enough description.`,
    category: o.category,
    material: o.material,
    tags: o.tags ?? [],
    images: [{ url: "/static/seed/pic1.jpeg" }],
    dimensions: { widthCm: 100, depthCm: 50, heightCm: 80 },
    variants: [
      {
        sku,
        color: o.color,
        material: o.material,
        price,
        mrp: price + 100_00,
        available: stock,
        reserved: 0,
        lowStockThreshold: 5,
      },
    ],
    status: o.status ?? ProductStatus.ACTIVE,
    minPrice: price,
    maxPrice: price,
    maxMrp: price + 100_00,
    inStock: stock > 0,
    soldCount: o.sold ?? 0,
    ratingAvg: o.rating ?? 0,
    ratingCount: o.rating ? 5 : 0,
  });
}
