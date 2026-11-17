import { randomBytes } from "node:crypto";

export const slugify = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

// "oak-table" -> "oak-table-4f3a1c" for when the plain slug is already taken
export const withSuffix = (slug: string) => `${slug}-${randomBytes(3).toString("hex")}`;
