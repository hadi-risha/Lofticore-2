import { Meilisearch } from "meilisearch";
import { ProductStatus } from "@lofticore/shared";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { Product } from "../modules/catalog/product.model";

// Product search through Meilisearch: typo tolerance ("sofaa" finds "sofa"), prefix matching
// as you type, and ranking by relevance. MongoDB stays the source of truth; this is a
// copy that is rebuilt at start-up and kept fresh by a small sync. If Meilisearch isn't
// configured or is down, every function returns null and the catalog falls back to
// MongoDB's own text search, so search never goes fully offline.

const client =
  env.MEILI_HOST && !env.isTest
    ? new Meilisearch({ host: env.MEILI_HOST, apiKey: env.MEILI_API_KEY })
    : null;
const index = client?.index("products") ?? null;

export const searchConfigured = () => index !== null;

interface SearchDoc {
  id: string;
  title: string;
  brand?: string;
  tags: string[];
  material?: string;
  description: string;
  status: string;
}

const toDoc = (p: {
  _id: unknown;
  title: string;
  brand?: string | null;
  tags?: string[];
  material?: string | null;
  description: string;
  status: string;
}): SearchDoc => ({
  id: String(p._id),
  title: p.title,
  brand: p.brand ?? undefined,
  tags: p.tags ?? [],
  material: p.material ?? undefined,
  description: p.description.slice(0, 1000),
  status: p.status,
});

// Ranked product ids for a search, or null when Meilisearch can't answer.
export async function searchIds(q: string, limit = 500): Promise<string[] | null> {
  if (!index) return null;
  try {
    const res = await index.search(q, {
      limit,
      filter: `status = ${ProductStatus.ACTIVE}`,
      attributesToRetrieve: ["id"],
    });
    return res.hits.map((h) => String(h.id));
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "meilisearch unavailable, using mongo search");
    return null;
  }
}

async function configure() {
  if (!index) return;
  await index.updateSettings({
    // earlier entries count for more: a title match beats a description match
    searchableAttributes: ["title", "tags", "brand", "material", "description"],
    filterableAttributes: ["status"],
  });
}

export async function reindexAll() {
  if (!index) return 0;
  await configure();
  const docs = await Product.find({}, "title brand tags material description status").lean();
  await index.deleteAllDocuments();
  if (docs.length) await index.addDocuments(docs.map(toDoc), { primaryKey: "id" });
  return docs.length;
}

// Sends products changed since the last run (edits, approvals, stock-driven status changes).
let lastSync = new Date();
export async function syncChanged() {
  if (!index) return 0;
  const since = lastSync;
  lastSync = new Date();
  const docs = await Product.find(
    { updatedAt: { $gte: since } },
    "title brand tags material description status",
  ).lean();
  if (docs.length) await index.addDocuments(docs.map(toDoc), { primaryKey: "id" });
  return docs.length;
}

export function startSearchSync() {
  if (!index) return () => {};
  void reindexAll()
    .then((n) => logger.info({ products: n }, "search index built"))
    .catch((err) => logger.warn({ err: err.message }, "could not build the search index"));
  const timer = setInterval(
    () => syncChanged().catch((err) => logger.warn({ err: err.message }, "search sync failed")),
    30_000,
  );
  timer.unref();
  return () => clearInterval(timer);
}

export async function searchHealth(): Promise<boolean> {
  if (!client) return false;
  try {
    return (await client.health()).status === "available";
  } catch {
    return false;
  }
}
