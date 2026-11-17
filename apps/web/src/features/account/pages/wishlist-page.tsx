import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/bits";
import { ProductGrid } from "@/features/catalog/components/product-card";
import { useWishlist } from "../api";

export function WishlistPage() {
  const { data, isLoading } = useWishlist();

  return (
    <div className="container-page py-10">
      <h1 className="text-3xl sm:text-4xl">Your wishlist</h1>
      {data && (
        <p className="mt-1 text-sm text-muted">
          {data.length} saved {data.length === 1 ? "piece" : "pieces"}
        </p>
      )}
      <div className="mt-8">
        {data?.length === 0 ? (
          <EmptyState
            title="Nothing saved yet"
            action={
              <Link to="/shop">
                <Button>Find something you love</Button>
              </Link>
            }
          >
            Tap the heart on any product to keep it here.
          </EmptyState>
        ) : (
          <ProductGrid products={data} loading={isLoading} count={4} />
        )}
      </div>
    </div>
  );
}
