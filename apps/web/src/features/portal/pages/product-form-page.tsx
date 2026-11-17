import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useFieldArray, useForm } from "react-hook-form";
import { ImagePlus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatINR, productInputSchema, productUpdateSchema } from "@lofticore/shared";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/bits";
import { ApiError } from "@/lib/api";
import { errorMessage } from "@/lib/query-client";
import { useCategories } from "@/features/catalog/api";
import {
  useAdjustStock,
  useCategoryOptions,
  useSaveProduct,
  useSellerProduct,
  useUpdateVariantPrice,
  useUploadImage,
  useUploadModel,
} from "../api";
import { PageHeader } from "../ui";

interface VariantRow {
  sku: string;
  color: string;
  material: string;
  size: string;
  price: string; // rupees as typed
  mrp: string;
  stock: string;
}

interface FormValues {
  title: string;
  description: string;
  categoryId: string;
  brand: string;
  material: string;
  tags: string;
  widthCm: string;
  depthCm: string;
  heightCm: string;
  weightKg: string;
  variants: VariantRow[];
}

const emptyVariant: VariantRow = {
  sku: "",
  color: "",
  material: "",
  size: "",
  price: "",
  mrp: "",
  stock: "",
};
const rupeesToPaise = (v: string) => Math.round(Number(v) * 100);
const num = (v: string) => (v.trim() === "" ? undefined : Number(v));
const select =
  "h-11 w-full rounded-xl border border-line bg-white px-3 text-sm outline-none focus:border-brand";

// Sellers type rupees; the API works in paise. Errors from the shared schemas come
// back keyed by path ("variants.0.mrp") and are shown next to the matching field.
function toPayload(
  v: FormValues,
  images: string[],
  modelUrl: string | null,
  withVariants: boolean,
) {
  const base = {
    title: v.title,
    description: v.description,
    categoryId: v.categoryId,
    brand: v.brand || undefined,
    material: v.material || undefined,
    tags: v.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    images: images.map((url) => ({ url })),
    model3d: modelUrl ? { glbUrl: modelUrl } : undefined,
    dimensions: {
      widthCm: num(v.widthCm),
      depthCm: num(v.depthCm),
      heightCm: num(v.heightCm),
      weightKg: num(v.weightKg),
    },
  };
  if (!withVariants) return base;
  return {
    ...base,
    variants: v.variants.map((r) => ({
      sku: r.sku,
      color: r.color || undefined,
      material: r.material || undefined,
      size: r.size || undefined,
      price: rupeesToPaise(r.price),
      mrp: rupeesToPaise(r.mrp),
      stock: r.stock === "" ? NaN : Number(r.stock),
    })),
  };
}

type ExistingProduct = NonNullable<ReturnType<typeof useSellerProduct>["data"]>;

// Wait for the product to load, then mount the form with its values already in place.
export function ProductFormPage() {
  const { id } = useParams();
  const { data: existing, isLoading } = useSellerProduct(id);
  if (id && (isLoading || !existing)) return <Skeleton className="h-96" />;
  return <ProductForm key={id ?? "new"} id={id} existing={existing} />;
}

function ProductForm({ id, existing }: { id?: string; existing?: ExistingProduct }) {
  const editing = Boolean(id);
  const navigate = useNavigate();
  const { data: categories } = useCategories();
  const options = useCategoryOptions(categories);
  const save = useSaveProduct(id);
  const upload = useUploadImage();
  const uploadModel = useUploadModel();
  const [modelUrl, setModelUrl] = useState<string | null>(existing?.model3d?.glbUrl ?? null);
  const modelInput = useRef<HTMLInputElement>(null);
  const adjust = useAdjustStock();
  const reprice = useUpdateVariantPrice();

  const [images, setImages] = useState<string[]>(() => existing?.images.map((i) => i.url) ?? []);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [topError, setTopError] = useState<string | null>(null);
  const [restock, setRestock] = useState<Record<string, string>>({});
  const fileInput = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, control } = useForm<FormValues>({
    defaultValues: existing
      ? {
          title: existing.title,
          description: existing.description,
          categoryId: existing.category._id,
          brand: existing.brand ?? "",
          material: existing.material ?? "",
          tags: existing.tags.join(", "),
          widthCm: String(existing.dimensions.widthCm),
          depthCm: String(existing.dimensions.depthCm),
          heightCm: String(existing.dimensions.heightCm),
          weightKg: existing.dimensions.weightKg ? String(existing.dimensions.weightKg) : "",
          variants: [],
        }
      : { variants: [emptyVariant], tags: "", categoryId: "" },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "variants" });

  const err = (path: string) => fieldErrors[path];

  const onSubmit = handleSubmit((values) => {
    setTopError(null);
    setFieldErrors({});
    const payload = toPayload(values, images, modelUrl, !editing);
    const parsed = (editing ? productUpdateSchema : productInputSchema).safeParse(payload);
    if (!parsed.success) {
      const map: Record<string, string> = {};
      for (const i of parsed.error.issues) map[i.path.join(".")] ??= i.message;
      setFieldErrors(map);
      setTopError("Some fields need your attention.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    save.mutate(parsed.data, {
      onSuccess: () => {
        toast.success(
          editing
            ? "Changes saved."
            : "Product saved as a draft. Send it for review when you're ready.",
        );
        navigate("/seller/products");
      },
      onError: (e) => {
        if (e instanceof ApiError && e.fields) setFieldErrors(e.fields);
        setTopError(errorMessage(e));
      },
    });
  });

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (images.length >= 8) break;
      try {
        const url = await upload.mutateAsync(file);
        setImages((prev) => [...prev, url]);
      } catch {
        /* the hook already showed why */
      }
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-3xl space-y-8">
      <PageHeader
        title={editing ? "Edit product" : "New product"}
        subtitle={
          <Link to="/seller/products" className="text-brand hover:underline">
            ← Back to products
          </Link>
        }
      />

      {topError && (
        <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
          {topError}
        </p>
      )}

      <section className="space-y-4 rounded-2xl border border-line bg-white p-5 sm:p-6">
        <h2 className="text-lg">The basics</h2>
        <Field label="Title" error={err("title")} {...register("title")} />
        <div>
          <label htmlFor="description" className="mb-1.5 block text-sm font-medium">
            Description
          </label>
          <textarea
            id="description"
            rows={5}
            className="w-full rounded-xl border border-line bg-white p-3.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            {...register("description")}
          />
          {err("description") && <p className="mt-1.5 text-xs text-danger">{err("description")}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="category" className="mb-1.5 block text-sm font-medium">
              Category
            </label>
            <select id="category" className={select} {...register("categoryId")}>
              <option value="">Choose…</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            {err("categoryId") && <p className="mt-1.5 text-xs text-danger">{err("categoryId")}</p>}
          </div>
          <Field
            label="Main material"
            placeholder="Oak, Brass, Velvet…"
            {...register("material")}
          />
          <Field label="Brand (optional)" {...register("brand")} />
          <Field
            label="Tags"
            placeholder="coffee table, round, oak"
            hint="Separate with commas. They help shoppers find it."
            {...register("tags")}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
        <h2 className="text-lg">Photos</h2>
        <p className="text-sm text-muted">
          Up to 8 images, JPG, PNG or WebP, 5 MB each. The first one is the cover.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {images.map((url, i) => (
            <div key={url} className="relative">
              <img src={url} alt="" className="size-24 rounded-xl object-cover" />
              {i === 0 && (
                <span className="absolute left-1 top-1 rounded bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  Cover
                </span>
              )}
              <button
                type="button"
                aria-label="Remove photo"
                onClick={() => setImages((p) => p.filter((x) => x !== url))}
                className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-danger text-white"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          ))}
          {images.length < 8 && (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={upload.isPending}
              className="grid size-24 place-items-center rounded-xl border-2 border-dashed border-line text-muted hover:border-brand hover:text-brand"
            >
              <span className="flex flex-col items-center gap-1 text-xs">
                <ImagePlus className="size-5" aria-hidden />
                {upload.isPending ? "Uploading…" : "Add"}
              </span>
            </button>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {err("images") && <p className="mt-2 text-xs text-danger">{err("images")}</p>}
      </section>

      <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
        <h2 className="text-lg">3D model for AR (optional)</h2>
        <p className="text-sm text-muted">
          Upload a .glb file and shoppers can see your product in their own room at its real size.
          It should be modelled at true scale, up to 25 MB.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={uploadModel.isPending}
            onClick={() => modelInput.current?.click()}
          >
            {modelUrl ? "Replace model" : "Upload .glb model"}
          </Button>
          {modelUrl && (
            <>
              <span className="text-sm text-success">Model added</span>
              <button
                type="button"
                className="text-sm text-muted hover:text-danger"
                onClick={() => setModelUrl(null)}
              >
                Remove
              </button>
            </>
          )}
        </div>
        <input
          ref={modelInput}
          type="file"
          accept=".glb,model/gltf-binary"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              setModelUrl(await uploadModel.mutateAsync(file));
            } catch {
              /* the hook already showed why */
            }
          }}
        />
      </section>

      <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
        <h2 className="text-lg">Size</h2>
        <p className="text-sm text-muted">
          In centimetres. Shoppers (and the AR view) rely on these being right.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field
            label="Width"
            inputMode="decimal"
            error={err("dimensions.widthCm")}
            {...register("widthCm")}
          />
          <Field
            label="Depth"
            inputMode="decimal"
            error={err("dimensions.depthCm")}
            {...register("depthCm")}
          />
          <Field
            label="Height"
            inputMode="decimal"
            error={err("dimensions.heightCm")}
            {...register("heightCm")}
          />
          <Field
            label="Weight (kg)"
            inputMode="decimal"
            error={err("dimensions.weightKg")}
            {...register("weightKg")}
          />
        </div>
      </section>

      {!editing ? (
        <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
          <h2 className="text-lg">Variants, prices and stock</h2>
          <p className="text-sm text-muted">
            One row for each finish or size you sell. Each needs its own code (SKU).
          </p>
          <div className="mt-4 space-y-5">
            {fields.map((f, i) => (
              <div key={f.id} className="rounded-xl border border-line p-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Field
                    label="SKU"
                    placeholder="OAK-TBL-1"
                    error={err(`variants.${i}.sku`)}
                    {...register(`variants.${i}.sku`)}
                  />
                  <Field
                    label="Colour / finish"
                    error={err(`variants.${i}.color`)}
                    {...register(`variants.${i}.color`)}
                  />
                  <Field label="Size (optional)" {...register(`variants.${i}.size`)} />
                  <Field
                    label="Stock"
                    inputMode="numeric"
                    error={err(`variants.${i}.stock`)}
                    {...register(`variants.${i}.stock`)}
                  />
                  <Field
                    label="Selling price (₹)"
                    inputMode="decimal"
                    error={err(`variants.${i}.price`)}
                    {...register(`variants.${i}.price`)}
                  />
                  <Field
                    label="MRP (₹)"
                    inputMode="decimal"
                    error={err(`variants.${i}.mrp`)}
                    {...register(`variants.${i}.mrp`)}
                  />
                </div>
                {fields.length > 1 && (
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-danger"
                  >
                    <Trash2 className="size-4" aria-hidden /> Remove this variant
                  </button>
                )}
              </div>
            ))}
          </div>
          {err("variants") && <p className="mt-2 text-xs text-danger">{err("variants")}</p>}
          <Button
            type="button"
            variant="secondary"
            className="mt-4"
            onClick={() => append(emptyVariant)}
          >
            <Plus className="size-4" aria-hidden /> Add another variant
          </Button>
        </section>
      ) : (
        <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
          <h2 className="text-lg">Stock and prices</h2>
          <div className="mt-4 divide-y divide-line">
            {existing?.variants.map((v) => (
              <div
                key={v.sku}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm first:pt-0"
              >
                <div>
                  <p className="font-medium">
                    {v.sku}
                    {(v.color || v.size) && (
                      <span className="font-normal text-muted">
                        {" "}
                        · {[v.color, v.size].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </p>
                  <p className="text-muted">
                    {formatINR(v.price)} (MRP {formatINR(v.mrp)}) · {v.available} available
                    {v.reserved > 0 && `, ${v.reserved} in checkouts`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    aria-label={`Change stock of ${v.sku} by`}
                    inputMode="numeric"
                    placeholder="± units"
                    value={restock[v.sku] ?? ""}
                    onChange={(e) =>
                      setRestock((r) => ({ ...r, [v.sku]: e.target.value.replace(/[^\d-]/g, "") }))
                    }
                    className="h-9 w-24 rounded-lg border border-line px-2.5 text-sm outline-none focus:border-brand"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!restock[v.sku] || Number(restock[v.sku]) === 0}
                    loading={adjust.isPending && adjust.variables?.sku === v.sku}
                    onClick={() =>
                      adjust.mutate(
                        { id: id!, sku: v.sku, delta: Number(restock[v.sku]) },
                        { onSuccess: () => setRestock((r) => ({ ...r, [v.sku]: "" })) },
                      )
                    }
                  >
                    Update stock
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const price = Number(
                        prompt(`New selling price for ${v.sku} (₹)`, String(v.price / 100)),
                      );
                      if (!price) return;
                      const mrp = Number(prompt("MRP (₹)", String(Math.max(v.mrp / 100, price))));
                      if (mrp)
                        reprice.mutate({
                          id: id!,
                          sku: v.sku,
                          price: Math.round(price * 100),
                          mrp: Math.round(mrp * 100),
                        });
                    }}
                  >
                    Change price
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="flex gap-3">
        <Button type="submit" size="lg" loading={save.isPending}>
          {editing ? "Save changes" : "Save as draft"}
        </Button>
        <Link to="/seller/products">
          <Button type="button" size="lg" variant="secondary">
            Cancel
          </Button>
        </Link>
      </div>
    </form>
  );
}
