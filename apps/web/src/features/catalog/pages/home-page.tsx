import { Link } from "react-router-dom";
import { ArrowRight, Hammer, Leaf, Truck } from "lucide-react";
import type { CategoryNode } from "@lofticore/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/bits";
import heroImage from "@/assets/home-bg1.webp";
import { useBestSellers, useCategories, useNewArrivals } from "../api";
import { ProductGrid } from "../components/product-card";
import { ProductRail } from "@/features/trust/product-rail";
import { useForYou, useRecentlyViewedProducts } from "@/features/trust/api";
import { useRecentlyViewed } from "@/stores/recently-viewed.store";

const perks = [
  {
    icon: Hammer,
    title: "Made by makers",
    text: "Every seller is checked by our team before they list a single piece.",
  },
  {
    icon: Truck,
    title: "Delivered with care",
    text: "Tracked from the workshop to your door, with a one-time code at handover.",
  },
  { icon: Leaf, title: "Easy returns", text: "Not right for your space? Return it within 7 days." },
];

function SectionHeading({
  title,
  to,
  linkLabel,
}: {
  title: string;
  to: string;
  linkLabel: string;
}) {
  return (
    <div className="mb-7 flex items-end justify-between gap-4">
      <h2 className="text-2xl sm:text-3xl">{title}</h2>
      <Link
        to={to}
        className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand hover:underline"
      >
        {linkLabel} <ArrowRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}

// Each top-level category and its subcategories, as photo tiles.
function CategoryTiles({ categories }: { categories: CategoryNode[] }) {
  const tiles = categories.flatMap((c) => c.children);
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-5">
      {tiles.slice(0, 10).map((c) => (
        <Link
          key={c.id}
          to={`/shop/${c.slug}`}
          className="group relative aspect-[4/5] overflow-hidden rounded-2xl bg-brand-soft"
        >
          {c.image && (
            <img
              src={c.image}
              alt=""
              loading="lazy"
              className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-transparent" />
          <span className="absolute bottom-3 left-4 right-4 font-display text-lg leading-tight text-white">
            {c.name}
          </span>
        </Link>
      ))}
    </div>
  );
}

export function HomePage() {
  const { data: categories } = useCategories();
  const best = useBestSellers(8);
  const fresh = useNewArrivals(4);
  const viewedIds = useRecentlyViewed((s) => s.ids);
  const forYou = useForYou(viewedIds, 4);
  const viewed = useRecentlyViewedProducts(viewedIds.slice(0, 4));

  return (
    <>
      <section className="relative isolate overflow-hidden">
        <img
          src={heroImage}
          alt=""
          fetchPriority="high"
          className="absolute inset-0 -z-10 size-full object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-ink/75 via-ink/45 to-transparent" />
        <div className="container-page py-24 sm:py-32 lg:py-40">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-gold">New season</p>
          <h1 className="mt-4 max-w-2xl text-4xl leading-[1.1] text-white sm:text-6xl">
            Furniture with a point of view
          </h1>
          <p className="mt-5 max-w-lg text-base text-white/85 sm:text-lg">
            Sculptural pieces from independent makers. Honest materials, rooms that feel like yours.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/shop">
              <Button size="lg" className="bg-gold text-ink hover:bg-gold/90">
                Shop the collection
              </Button>
            </Link>
            <Link to="/shop?sort=newest">
              <Button
                size="lg"
                variant="secondary"
                className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
              >
                What&apos;s new
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="container-page mt-16">
        <SectionHeading title="Shop by room and style" to="/shop" linkLabel="See everything" />
        {categories ? (
          <CategoryTiles categories={categories} />
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="aspect-[4/5] rounded-2xl" />
            ))}
          </div>
        )}
      </section>

      <section className="container-page mt-20">
        <SectionHeading title="Best sellers" to="/shop?sort=popular" linkLabel="View all" />
        <ProductGrid products={best.data} loading={best.isLoading} />
      </section>

      <div className="container-page">
        <ProductRail
          title={forYou.data?.personalised ? "Picked for you" : "Popular right now"}
          subtitle={
            forYou.data?.personalised
              ? "Based on what you've browsed, saved and bought."
              : undefined
          }
          products={forYou.data?.items}
          loading={forYou.isLoading}
        />
        <ProductRail title="Pick up where you left off" products={viewed.data} />
      </div>

      <section className="mt-20 bg-brand-soft py-14">
        <div className="container-page grid gap-8 md:grid-cols-3">
          {perks.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand text-white">
                <Icon className="size-5" aria-hidden />
              </span>
              <div>
                <h3 className="font-sans text-base font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-ink/70">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="container-page mt-20">
        <SectionHeading title="Just in" to="/shop?sort=newest" linkLabel="View all" />
        <ProductGrid products={fresh.data} loading={fresh.isLoading} count={4} />
      </section>
    </>
  );
}
