import { createBrowserRouter, type RouteObject } from "react-router-dom";
import { Role } from "@lofticore/shared";
import { Layout } from "@/components/layout/layout";
import { GuestOnly, RequireAuth, RequireStaff2fa } from "@/features/auth/guards";
import { PortalLayout } from "@/features/portal/portal-layout";
import { ErrorPage, NotFoundPage } from "@/pages/not-found";

// Pages load on demand, so the first visit downloads only what it needs.
// page(() => import("..."), "ExportName") gives a route whose component loads when first visited.
const page = (
  loader: () => Promise<Record<string, unknown>>,
  name: string,
): Pick<RouteObject, "lazy"> => ({
  lazy: async () => ({ Component: (await loader())[name] as never }),
});

const catalog = {
  home: page(() => import("@/features/catalog/pages/home-page"), "HomePage"),
  shop: page(() => import("@/features/catalog/pages/shop-page"), "ShopPage"),
  product: page(() => import("@/features/catalog/pages/product-page"), "ProductPage"),
};

const auth = {
  login: page(() => import("@/features/auth/pages/login-page"), "LoginPage"),
  register: page(() => import("@/features/auth/pages/register-page"), "RegisterPage"),
  verify: page(() => import("@/features/auth/pages/verify-email-page"), "VerifyEmailPage"),
  forgot: page(() => import("@/features/auth/pages/forgot-password-page"), "ForgotPasswordPage"),
  reset: page(() => import("@/features/auth/pages/reset-password-page"), "ResetPasswordPage"),
  invite: page(() => import("@/features/auth/pages/accept-invite-page"), "AcceptInvitePage"),
  twoFactor: page(
    () => import("@/features/auth/pages/two-factor-setup-page"),
    "TwoFactorSetupPage",
  ),
};

const shopper = {
  cart: page(() => import("@/features/cart/cart-page"), "CartPage"),
  checkout: page(() => import("@/features/orders/pages/checkout-page"), "CheckoutPage"),
  pay: page(() => import("@/features/orders/pages/pay-page"), "PayPage"),
  orders: page(() => import("@/features/orders/pages/orders-page"), "OrdersPage"),
  order: page(() => import("@/features/orders/pages/order-detail-page"), "OrderDetailPage"),
  status: page(() => import("@/pages/status-page"), "StatusPage"),
  wishlist: page(() => import("@/features/account/pages/wishlist-page"), "WishlistPage"),
  addresses: page(() => import("@/features/account/pages/addresses-page"), "AddressesPage"),
};

const portal = {
  details: page(() => import("@/features/portal/pages/my-details-page"), "MyDetailsPage"),
  sellerHome: page(
    () => import("@/features/portal/pages/seller-dashboard-page"),
    "SellerDashboardPage",
  ),
  sellerProducts: page(
    () => import("@/features/portal/pages/seller-products-page"),
    "SellerProductsPage",
  ),
  productForm: page(() => import("@/features/portal/pages/product-form-page"), "ProductFormPage"),
  sellerOrders: page(
    () => import("@/features/portal/pages/seller-orders-page"),
    "SellerOrdersPage",
  ),
  delivery: page(() => import("@/features/portal/pages/delivery-page"), "DeliveryPage"),
  adminHome: page(
    () => import("@/features/portal/pages/admin-dashboard-page"),
    "AdminDashboardPage",
  ),
  adminUsers: page(() => import("@/features/portal/pages/admin-users-page"), "AdminUsersPage"),
  adminUser: page(() => import("@/features/portal/pages/admin-user-page"), "AdminUserPage"),
  adminReview: page(() => import("@/features/portal/pages/admin-review-page"), "AdminReviewPage"),
  adminOrders: page(() => import("@/features/portal/pages/admin-orders-page"), "AdminOrdersPage"),
  adminReports: page(
    () => import("@/features/portal/pages/admin-reports-page"),
    "AdminReportsPage",
  ),
  adminTeam: page(() => import("@/features/portal/pages/admin-team-page"), "AdminTeamPage"),
  adminAudit: page(() => import("@/features/portal/pages/admin-audit-page"), "AdminAuditPage"),
};

const TEAM = [Role.ADMIN, Role.SUPER_ADMIN];

export const router = createBrowserRouter([
  // the demo UPI app is its own "phone" screen, outside the shop layout
  {
    path: "mock-upi/:token",
    errorElement: <ErrorPage />,
    ...page(() => import("@/features/orders/pages/mock-upi-page"), "MockUpiPage"),
  },
  {
    element: <Layout />,
    errorElement: <ErrorPage />,
    children: [
      { index: true, ...catalog.home },
      { path: "shop", ...catalog.shop },
      { path: "shop/:categorySlug", ...catalog.shop },
      { path: "product/:slug", ...catalog.product },
      { path: "cart", ...shopper.cart },

      {
        element: <GuestOnly />,
        children: [
          { path: "login", ...auth.login },
          { path: "register", ...auth.register },
          { path: "verify-email", ...auth.verify },
          { path: "forgot-password", ...auth.forgot },
          { path: "reset-password", ...auth.reset },
          { path: "accept-invite", ...auth.invite },
        ],
      },

      { path: "status", ...shopper.status },

      // customers
      {
        element: <RequireAuth />,
        children: [
          { path: "checkout", ...shopper.checkout },
          { path: "pay/:orderId", ...shopper.pay },
          { path: "orders", ...shopper.orders },
          { path: "orders/:orderId", ...shopper.order },
          { path: "wishlist", ...shopper.wishlist },
          { path: "account/addresses", ...shopper.addresses },
        ],
      },

      // team accounts set up their authenticator before anything else
      {
        element: <RequireAuth roles={TEAM} />,
        children: [{ path: "security/2fa", ...auth.twoFactor }],
      },

      {
        element: <RequireAuth roles={[Role.SELLER]} />,
        children: [
          {
            path: "seller",
            element: <PortalLayout kind="seller" />,
            children: [
              { index: true, ...portal.sellerHome },
              { path: "products", ...portal.sellerProducts },
              { path: "products/new", ...portal.productForm },
              { path: "products/:id", ...portal.productForm },
              { path: "orders", ...portal.sellerOrders },
              { path: "profile", ...portal.details },
            ],
          },
        ],
      },

      {
        element: <RequireAuth roles={[Role.DELIVERY]} />,
        children: [
          {
            path: "delivery",
            element: <PortalLayout kind="delivery" />,
            children: [
              { index: true, ...portal.delivery },
              { path: "profile", ...portal.details },
            ],
          },
        ],
      },

      {
        element: <RequireAuth roles={TEAM} />,
        children: [
          {
            element: <RequireStaff2fa />,
            children: [
              {
                path: "admin",
                element: <PortalLayout kind="admin" />,
                children: [
                  { index: true, ...portal.adminHome },
                  { path: "users", ...portal.adminUsers },
                  { path: "users/:userId", ...portal.adminUser },
                  { path: "products", ...portal.adminReview },
                  { path: "orders", ...portal.adminOrders },
                  { path: "reports", ...portal.adminReports },
                  {
                    element: <RequireAuth roles={[Role.SUPER_ADMIN]} />,
                    children: [
                      { path: "staff", ...portal.adminTeam },
                      { path: "audit", ...portal.adminAudit },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },

      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
