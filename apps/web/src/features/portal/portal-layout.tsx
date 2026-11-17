import { NavLink, Outlet } from "react-router-dom";
import {
  BarChart3,
  ClipboardCheck,
  Flag,
  Package,
  ScrollText,
  Shield,
  ShoppingBag,
  Truck,
  UserCog,
  Users,
} from "lucide-react";
import { Role } from "@lofticore/shared";
import { cn } from "@/lib/cn";
import { useAuthStore } from "@/stores/auth.store";

interface Item {
  to: string;
  label: string;
  icon: typeof Package;
  end?: boolean;
  roles?: Role[];
  // marks the link for the guided tour
  tour?: string;
}

// Each role gets its own set of screens; the server enforces the same rules.
const MENUS: Record<"seller" | "delivery" | "admin", { title: string; items: Item[] }> = {
  seller: {
    title: "Seller studio",
    items: [
      { to: "/seller", label: "Overview", icon: BarChart3, end: true, tour: "nav-seller" },
      { to: "/seller/products", label: "Products", icon: Package, tour: "nav-products" },
      { to: "/seller/orders", label: "Orders", icon: ShoppingBag, tour: "nav-orders" },
      { to: "/seller/profile", label: "Business details", icon: UserCog, tour: "nav-details" },
    ],
  },
  delivery: {
    title: "Deliveries",
    items: [
      { to: "/delivery", label: "My deliveries", icon: Truck, end: true, tour: "nav-deliveries" },
      { to: "/delivery/profile", label: "My details", icon: UserCog, tour: "nav-details" },
    ],
  },
  admin: {
    title: "Admin",
    items: [
      { to: "/admin", label: "Overview", icon: BarChart3, end: true, tour: "nav-overview" },
      { to: "/admin/users", label: "People", icon: Users, tour: "nav-people" },
      { to: "/admin/products", label: "Product review", icon: ClipboardCheck, tour: "nav-product" },
      { to: "/admin/orders", label: "Orders", icon: ShoppingBag },
      { to: "/admin/reports", label: "Reports", icon: Flag, tour: "nav-reports" },
      { to: "/admin/staff", label: "Team", icon: Shield, roles: [Role.SUPER_ADMIN] },
      { to: "/admin/audit", label: "Activity log", icon: ScrollText, roles: [Role.SUPER_ADMIN] },
    ],
  },
};

export function PortalLayout({ kind }: { kind: keyof typeof MENUS }) {
  const role = useAuthStore((s) => s.user?.role);
  const menu = MENUS[kind];
  const items = menu.items.filter((i) => !i.roles || (role && i.roles.includes(role)));

  const link = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors",
      isActive ? "bg-brand text-white" : "text-ink/80 hover:bg-brand-soft",
    );

  return (
    <div className="container-page py-6 lg:grid lg:grid-cols-[220px_1fr] lg:gap-8">
      <aside className="mb-6 lg:mb-0">
        <p className="mb-3 hidden font-display text-lg text-brand lg:block">{menu.title}</p>
        {/* a scrolling row on phones, a column on desktop */}
        <nav
          aria-label={menu.title}
          className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:flex-col lg:overflow-visible"
        >
          {items.map(({ to, label, icon: Icon, end, tour }) => (
            <NavLink key={to} to={to} end={end} className={link} data-tour={tour}>
              <Icon className="size-4" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <section className="min-w-0">
        <Outlet />
      </section>
    </div>
  );
}
