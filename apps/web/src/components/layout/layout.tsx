import { useEffect } from "react";
import { Outlet, ScrollRestoration, useLocation } from "react-router-dom";
import { ChatWidget } from "@/features/assistant/chat-widget";
import { TourController } from "@/features/tour/tour-controller";
import { Footer } from "./footer";
import { Header } from "./header";

export function Layout() {
  const { pathname } = useLocation();

  // move focus to the top of the new page so keyboard and screen-reader users
  // aren't left stranded where the old page's link was
  useEffect(() => {
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-white focus:px-4 focus:py-2"
      >
        Skip to content
      </a>
      <Header />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <Outlet />
      </main>
      <Footer />
      <ChatWidget />
      <TourController />
      <ScrollRestoration />
    </div>
  );
}
