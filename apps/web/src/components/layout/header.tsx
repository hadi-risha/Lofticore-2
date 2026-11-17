import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  Compass,
  Heart,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Package,
  ShoppingBag,
  User,
  X,
} from "lucide-react";
import { Role } from "@lofticore/shared";
import { toast } from "sonner";
import { useCategories } from "@/features/catalog/api";
import { signOut } from "@/features/auth/session";
import { useTourRequests } from "@/features/tour/tour-controller";
import { cn } from "@/lib/cn";
import { useAuthStore } from "@/stores/auth.store";
import { selectCartCount, useCartStore } from "@/stores/cart.store";
import logo from "@/assets/lofticore-logo.png";
import { NotificationBell } from "@/features/trust/notification-bell";
import { SearchBox } from "./search-box";

const navLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    "text-sm font-medium transition-colors hover:text-brand",
    isActive ? "text-brand" : "text-ink/80",
  );

function AccountMenu() {
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const startTour = useTourRequests((s) => s.start);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (status === "loading") return <div className="size-10" aria-hidden />;

  if (!user) {
    return (
      <Link
        to="/login"
        aria-label="Sign in"
        className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full border border-brand/30 px-3 text-sm font-medium text-brand hover:bg-brand-soft sm:px-4"
      >
        <User className="size-4" aria-hidden />
        <span className="hidden sm:inline">Sign in</span>
      </Link>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
        data-tour="account"
        className="grid size-10 place-items-center rounded-full bg-brand text-sm font-semibold text-white"
      >
        {user.name.charAt(0).toUpperCase()}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-50 w-64 rounded-2xl border border-line bg-white p-2 shadow-xl"
        >
          <div className="border-b border-line px-3 pb-3 pt-2">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
            {user.status === "pending_approval" && (
              <p className="mt-2 rounded-lg bg-gold/20 px-2 py-1 text-xs text-bronze">
                Waiting for admin approval
              </p>
            )}
          </div>
          {[
            ...(user.role === Role.SELLER
              ? [{ to: "/seller", label: "Seller studio", icon: LayoutDashboard }]
              : []),
            ...(user.role === Role.DELIVERY
              ? [{ to: "/delivery", label: "My deliveries", icon: LayoutDashboard }]
              : []),
            ...(user.role === Role.ADMIN || user.role === Role.SUPER_ADMIN
              ? [{ to: "/admin", label: "Admin panel", icon: LayoutDashboard }]
              : []),
            ...(user.role === Role.CUSTOMER
              ? [
                  { to: "/orders", label: "My orders", icon: Package },
                  { to: "/wishlist", label: "Wishlist", icon: Heart },
                  { to: "/account/addresses", label: "Addresses", icon: MapPin },
                ]
              : []),
          ].map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="mt-1 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm hover:bg-brand-soft"
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </Link>
          ))}
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              startTour();
            }}
            className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm hover:bg-brand-soft"
          >
            <Compass className="size-4" aria-hidden />
            Take the tour
          </button>
          <button
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              await signOut();
              toast.success("You're signed out.");
            }}
            className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm hover:bg-brand-soft"
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function Header() {
  const { data: categories = [] } = useCategories();
  const cartCount = useCartStore(selectCartCount);
  const signedInUser = useAuthStore((s) => s.user);
  // the menu belongs to the page it was opened on, so going to another page closes it
  const [openOn, setOpenOn] = useState<string | null>(null);
  const { pathname } = useLocation();
  const menuOpen = openOn === pathname;
  const setMenuOpen = (open: boolean) => setOpenOn(open ? pathname : null);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-cream/90 backdrop-blur">
      <div className="bg-brand py-1.5 text-center text-xs text-white">
        Free delivery on orders above ₹10,000 · Easy 7-day returns
      </div>

      <div className="container-page flex h-16 items-center gap-4">
        <button
          className="grid size-10 place-items-center rounded-full hover:bg-brand-soft lg:hidden"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="size-5" />
        </button>

        <Link to="/" className="flex shrink-0 items-center gap-2" aria-label="Lofticore home">
          <img src={logo} alt="" className="size-9 rounded-full object-cover" />
          <span className="font-display text-xl font-semibold tracking-tight text-brand">
            Lofticore
          </span>
        </Link>

        <nav data-tour="nav" className="ml-6 hidden items-center gap-6 lg:flex" aria-label="Main">
          <NavLink to="/shop" end className={navLink}>
            Shop all
          </NavLink>
          {categories.map((c) => (
            <NavLink key={c.id} to={`/shop/${c.slug}`} className={navLink}>
              {c.name}
            </NavLink>
          ))}
        </nav>

        <SearchBox tour="search" className="ml-auto hidden w-full max-w-xs md:block lg:max-w-sm" />

        <div className="ml-auto flex items-center gap-1.5 md:ml-0">
          {signedInUser && <NotificationBell />}
          <Link
            to="/cart"
            data-tour="cart"
            className="relative grid size-10 place-items-center rounded-full hover:bg-brand-soft"
            aria-label={`Cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`}
          >
            <ShoppingBag className="size-5" aria-hidden />
            {cartCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-gold px-1 text-[11px] font-bold leading-5 text-ink">
                {cartCount}
              </span>
            )}
          </Link>
          <AccountMenu />
        </div>
      </div>

      {/* mobile drawer */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <div
            className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-80 max-w-[85vw] overflow-y-auto bg-cream p-5 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <span className="font-display text-xl font-semibold text-brand">Menu</span>
              <button
                className="grid size-10 place-items-center rounded-full hover:bg-brand-soft"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
              >
                <X className="size-5" />
              </button>
            </div>
            <SearchBox onDone={() => setMenuOpen(false)} />
            <nav className="mt-5 flex flex-col" aria-label="Mobile">
              <NavLink to="/shop" end className="border-b border-line py-3.5 text-base font-medium">
                Shop all
              </NavLink>
              {categories.map((c) => (
                <div key={c.id} className="border-b border-line py-3">
                  <NavLink to={`/shop/${c.slug}`} className="block py-1 text-base font-medium">
                    {c.name}
                  </NavLink>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    {c.children.map((ch) => (
                      <NavLink
                        key={ch.id}
                        to={`/shop/${ch.slug}`}
                        className="py-1 text-sm text-muted"
                      >
                        {ch.name}
                      </NavLink>
                    ))}
                  </div>
                </div>
              ))}
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
