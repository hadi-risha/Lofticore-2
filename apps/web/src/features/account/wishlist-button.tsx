import { useNavigate } from "react-router-dom";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { useAuthStore } from "@/stores/auth.store";
import { useToggleWishlist, useWishlistIds } from "./api";

// The heart on product cards and pages. Guests are asked to sign in instead of
// seeing a button that silently does nothing.
export function WishlistButton({
  productId,
  className,
}: {
  productId: string;
  className?: string;
}) {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const { data: ids } = useWishlistIds();
  const toggle = useToggleWishlist();
  const saved = ids?.has(productId) ?? false;

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? "Remove from wishlist" : "Save to wishlist"}
      onClick={(e) => {
        // the card is also a link; the heart shouldn't open the product
        e.preventDefault();
        e.stopPropagation();
        if (!user) {
          toast("Sign in to save items to your wishlist.", {
            action: {
              label: "Sign in",
              onClick: () =>
                navigate("/login", { state: { from: location.pathname + location.search } }),
            },
          });
          return;
        }
        toggle.mutate({ productId, saved });
      }}
      className={cn(
        "grid size-9 place-items-center rounded-full bg-white/90 shadow-sm backdrop-blur transition hover:scale-110",
        className,
      )}
    >
      <Heart
        className={cn("size-[18px]", saved ? "fill-danger text-danger" : "text-ink")}
        aria-hidden
      />
    </button>
  );
}
