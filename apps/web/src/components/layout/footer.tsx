import { Link } from "react-router-dom";
import { useCategories } from "@/features/catalog/api";

export function Footer() {
  const { data: categories = [] } = useCategories();
  const year = new Date().getFullYear();

  return (
    <footer className="mt-24 bg-brand text-white">
      <div className="container-page grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <p className="font-display text-2xl">Lofticore</p>
          <p className="mt-3 max-w-sm text-sm text-white/70">
            Sculptural furniture and decor from independent makers, made to be lived with.
          </p>
        </div>

        <div>
          <p className="text-sm font-semibold text-gold">Shop</p>
          <ul className="mt-3 space-y-2 text-sm text-white/80">
            <li>
              <Link to="/shop" className="hover:text-white">
                All products
              </Link>
            </li>
            {categories.map((c) => (
              <li key={c.id}>
                <Link to={`/shop/${c.slug}`} className="hover:text-white">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-sm font-semibold text-gold">Sell with us</p>
          <ul className="mt-3 space-y-2 text-sm text-white/80">
            <li>
              <Link to="/register?role=seller" className="hover:text-white">
                Become a seller
              </Link>
            </li>
            <li>
              <Link to="/register?role=delivery" className="hover:text-white">
                Deliver with us
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-5 text-center text-xs text-white/60">
        © {year} Lofticore. All rights reserved. ·{" "}
        <Link to="/status" className="underline hover:text-white">
          System status
        </Link>
      </div>
    </footer>
  );
}
