import { Link } from "react-router-dom";
import type { ProductSummary } from "@lofticore/shared";
import { Badge, Price, Rating, Skeleton } from "@/components/ui/bits";
import { WishlistButton } from "@/features/account/wishlist-button";

export function ProductCard({ product }: { product: ProductSummary }) {
  return (
    <article className="group">
      <Link to={`/product/${product.slug}`} className="block">
        <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-brand-soft">
          <img
            src={product.image}
            alt={product.title}
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
            {product.discountPct > 0 && <Badge tone="gold">{product.discountPct}% off</Badge>}
            {product.has3d && <Badge>View in AR</Badge>}
          </div>
          <WishlistButton productId={product.id} className="absolute right-3 top-3" />
          {!product.inStock && (
            <div className="absolute inset-0 grid place-items-center bg-cream/70">
              <Badge tone="danger">Sold out</Badge>
            </div>
          )}
        </div>
        <h3 className="mt-3 line-clamp-2 font-sans text-sm font-medium leading-snug">
          {product.title}
        </h3>
      </Link>
      <div className="mt-1.5 space-y-1">
        <Price price={product.price} mrp={product.mrp} />
        <div>
          <Rating value={product.ratingAvg} count={product.ratingCount} />
        </div>
      </div>
    </article>
  );
}

export const ProductCardSkeleton = () => (
  <div>
    <Skeleton className="aspect-[4/5] rounded-2xl" />
    <Skeleton className="mt-3 h-4 w-4/5" />
    <Skeleton className="mt-2 h-4 w-1/3" />
  </div>
);

export function ProductGrid({
  products,
  loading,
  count = 8,
}: {
  products?: ProductSummary[];
  loading?: boolean;
  count?: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 xl:grid-cols-4">
      {loading || !products
        ? Array.from({ length: count }, (_, i) => <ProductCardSkeleton key={i} />)
        : products.map((p) => <ProductCard key={p.id} product={p} />)}
    </div>
  );
}
