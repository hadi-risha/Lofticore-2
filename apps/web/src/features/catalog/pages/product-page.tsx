import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Box, Minus, Plus, Ruler, ShieldCheck, Truck } from "lucide-react";
import { toast } from "sonner";
import type { ProductDetail, VariantView } from "@lofticore/shared";
import { Button } from "@/components/ui/button";
import { Badge, Price, Rating, Skeleton } from "@/components/ui/bits";
import { WishlistButton } from "@/features/account/wishlist-button";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useCartStore } from "@/stores/cart.store";
import { useProduct } from "../api";
import { ReportButton } from "@/features/trust/report-dialog";
import { ReviewsSection } from "@/features/trust/reviews-section";
import { ProductRail } from "@/features/trust/product-rail";
import { ArViewer } from "../components/ar-viewer";
import { useBoughtTogether } from "@/features/trust/api";
import { useRecentlyViewed } from "@/stores/recently-viewed.store";
import { NotFoundPage } from "@/pages/not-found";

const variantLabel = (v: VariantView) =>
  [v.color, v.size].filter(Boolean).join(" · ") || v.material || v.sku;

function Gallery({ product }: { product: ProductDetail }) {
  const [index, setIndex] = useState(0);
  const [show3d, setShow3d] = useState(false);
  const image = product.images[index] ?? product.images[0];
  const glbUrl = product.model3d?.glbUrl;
  return (
    <div>
      {show3d && glbUrl ? (
        <ArViewer
          glbUrl={glbUrl}
          title={product.title}
          poster={product.image}
          dimensions={product.dimensions}
        />
      ) : (
        <div className="aspect-square overflow-hidden rounded-3xl bg-brand-soft">
          <img
            src={image?.url}
            alt={image?.alt ?? product.title}
            className="size-full object-cover"
          />
        </div>
      )}
      {glbUrl && (
        <button
          onClick={() => setShow3d((v) => !v)}
          className="mt-3 inline-flex items-center gap-2 rounded-full border border-brand/30 bg-white px-4 py-2 text-sm font-medium text-brand hover:bg-brand-soft"
        >
          <Box className="size-4" aria-hidden /> {show3d ? "Back to photos" : "View in 3D / AR"}
        </button>
      )}
      {product.images.length > 1 && (
        <div className="mt-3 flex gap-2.5 overflow-x-auto">
          {product.images.map((img, i) => (
            <button
              key={img.url}
              onClick={() => setIndex(i)}
              aria-label={`Show image ${i + 1}`}
              aria-current={i === index}
              className={cn(
                "size-20 shrink-0 overflow-hidden rounded-xl border-2",
                i === index ? "border-brand" : "border-transparent opacity-70 hover:opacity-100",
              )}
            >
              <img src={img.url} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Details({ product }: { product: ProductDetail }) {
  const [sku, setSku] = useState(
    product.variants.find((v) => v.available > 0)?.sku ?? product.variants[0]!.sku,
  );
  const [qty, setQty] = useState(1);
  const add = useCartStore((s) => s.add);

  const variant = product.variants.find((v) => v.sku === sku)!;
  const soldOut = variant.available === 0;
  const maxQty = Math.max(1, variant.available);
  const { dimensions: d } = product;

  const addToCart = () => {
    add(
      {
        productId: product.id,
        sku: variant.sku,
        slug: product.slug,
        title: product.title,
        image: product.image,
        variantLabel: variantLabel(variant),
        price: variant.price,
      },
      qty,
    );
    toast.success(`Added ${qty > 1 ? `${qty} × ` : ""}${product.title} to your cart.`, {
      action: { label: "View cart", onClick: () => (window.location.href = "/cart") },
    });
  };

  return (
    <div>
      <Link to={`/shop/${product.category.slug}`} className="text-sm text-bronze hover:underline">
        {product.category.name}
      </Link>
      <h1 className="mt-1 text-3xl sm:text-4xl">{product.title}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Rating value={product.ratingAvg} count={product.ratingCount} />
        {product.soldCount > 20 && (
          <span className="text-xs text-muted">{product.soldCount}+ sold</span>
        )}
      </div>

      <div className="mt-5 flex items-center gap-3">
        <Price price={variant.price} mrp={variant.mrp} size="lg" />
        {variant.mrp > variant.price && (
          <Badge tone="gold">
            {Math.round(((variant.mrp - variant.price) / variant.mrp) * 100)}% off
          </Badge>
        )}
      </div>
      <p className="mt-1 text-xs text-muted">Inclusive of all taxes</p>

      {product.variants.length > 1 && (
        <fieldset className="mt-6">
          <legend className="mb-2 text-sm font-medium">
            Finish: <span className="font-normal text-muted">{variantLabel(variant)}</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {product.variants.map((v) => (
              <button
                key={v.sku}
                onClick={() => {
                  setSku(v.sku);
                  setQty(1);
                }}
                aria-pressed={v.sku === sku}
                disabled={v.available === 0}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:line-through",
                  v.sku === sku
                    ? "border-brand bg-brand text-white"
                    : "border-line bg-white hover:border-brand",
                )}
              >
                {variantLabel(v)}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <div className="mt-6">
        {soldOut ? (
          <Badge tone="danger">Sold out</Badge>
        ) : variant.lowStock ? (
          <p className="text-sm font-medium text-danger">
            Only {variant.available} left - order soon
          </p>
        ) : (
          <p className="text-sm font-medium text-success">In stock</p>
        )}
      </div>

      <div className="mt-5 flex items-center gap-3">
        <div className="flex h-12 items-center rounded-full border border-line bg-white">
          <button
            className="grid size-12 place-items-center disabled:opacity-40"
            onClick={() => setQty((q) => q - 1)}
            disabled={qty <= 1}
            aria-label="Decrease quantity"
          >
            <Minus className="size-4" />
          </button>
          <span className="w-8 text-center text-sm font-medium" aria-live="polite">
            {qty}
          </span>
          <button
            className="grid size-12 place-items-center disabled:opacity-40"
            onClick={() => setQty((q) => q + 1)}
            disabled={qty >= Math.min(maxQty, 10)}
            aria-label="Increase quantity"
          >
            <Plus className="size-4" />
          </button>
        </div>
        <Button size="lg" className="flex-1" onClick={addToCart} disabled={soldOut}>
          {soldOut ? "Sold out" : "Add to cart"}
        </Button>
        <WishlistButton productId={product.id} className="size-12 border border-line bg-white" />
      </div>

      <ul className="mt-6 grid gap-3 text-sm text-ink/80 sm:grid-cols-2">
        <li className="flex items-center gap-2.5">
          <Truck className="size-4 text-brand" aria-hidden /> Free delivery above ₹10,000
        </li>
        <li className="flex items-center gap-2.5">
          <ShieldCheck className="size-4 text-brand" aria-hidden /> 7-day easy returns
        </li>
      </ul>

      <section className="mt-10">
        <h2 className="text-xl">About this piece</h2>
        <p className="mt-3 leading-relaxed text-ink/80">{product.description}</p>
        {product.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {product.tags.map((t) => (
              <Link
                key={t}
                to={`/shop?q=${encodeURIComponent(t)}`}
                className="rounded-full bg-brand-soft px-3 py-1 text-xs hover:bg-brand/15"
              >
                {t}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8 rounded-2xl border border-line bg-white p-5">
        <h2 className="flex items-center gap-2 text-xl">
          <Ruler className="size-5 text-brand" aria-hidden /> Size &amp; materials
        </h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          {[
            ["Width", `${d.widthCm} cm`],
            ["Depth", `${d.depthCm} cm`],
            ["Height", `${d.heightCm} cm`],
            d.weightKg ? ["Weight", `${d.weightKg} kg`] : null,
            (variant.material ?? product.material)
              ? ["Material", variant.material ?? product.material!]
              : null,
            product.brand ? ["Brand", product.brand] : null,
          ]
            .filter((x): x is string[] => Boolean(x))
            .map(([k, v]) => (
              <div key={k}>
                <dt className="text-muted">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
        </dl>
      </section>

      <p className="mt-6 text-sm text-muted">
        Sold by <span className="font-medium text-ink">{product.seller.name}</span>
      </p>
    </div>
  );
}

export function ProductPage() {
  const { slug = "" } = useParams();
  const { data: product, isLoading, error } = useProduct(slug);
  const { data: together } = useBoughtTogether(product ? [product.id] : [], 4);
  const markViewed = useRecentlyViewed((s) => s.add);
  const productId = product?.id;

  // remember what you've looked at, to tailor suggestions elsewhere
  useEffect(() => {
    if (productId) markViewed(productId);
  }, [productId, markViewed]);

  if (error instanceof ApiError && error.status === 404) return <NotFoundPage />;

  if (isLoading || !product) {
    return (
      <div className="container-page grid gap-10 py-10 lg:grid-cols-2">
        <Skeleton className="aspect-square rounded-3xl" />
        <div className="space-y-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-8">
      <nav aria-label="Breadcrumb" className="mb-5 text-sm text-muted">
        <Link to="/" className="hover:text-brand">
          Home
        </Link>{" "}
        /{" "}
        <Link to="/shop" className="hover:text-brand">
          Shop
        </Link>{" "}
        /{" "}
        <Link to={`/shop/${product.category.slug}`} className="hover:text-brand">
          {product.category.name}
        </Link>
      </nav>

      {/* key resets the chosen variant and quantity when you move to another product */}
      <div key={product.id} className="grid gap-10 lg:grid-cols-2 lg:gap-14">
        <Gallery product={product} />
        <Details product={product} />
      </div>

      <ProductRail
        title="Customers also bought"
        subtitle="Chosen from what people buy together."
        products={together}
      />

      <ReviewsSection slug={product.slug} productTitle={product.title} />

      <p className="mt-10 text-center">
        <ReportButton
          targetType="product"
          targetId={product.id}
          label={product.title}
          reasons={["counterfeit", "not_as_described", "scam", "other"]}
        >
          Report a problem with this listing
        </ReportButton>
      </p>
    </div>
  );
}
