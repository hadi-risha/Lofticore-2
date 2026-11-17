import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const API = "http://localhost:5000";

// `vite preview` serves the same security headers as production (they come from vercel.json),
// so a Content-Security-Policy mistake shows up locally instead of after a deploy.
const vercel = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, "vercel.json"), "utf8"),
) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
const securityHeaders = Object.fromEntries(
  (vercel.headers.find((h) => h.source === "/(.*)")?.headers ?? []).map((h) => [h.key, h.value]),
);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  build: {
    rollupOptions: {
      output: {
        // Split rarely-changing libraries into their own files, so a deploy of our code
        // doesn't make everyone re-download React and friends.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          // works for both / and \ path separators
          const path = id.replaceAll("\\", "/");
          const inPackage = (...names: string[]) =>
            names.some((n) => path.includes("/node_modules/" + n + "/"));
          if (inPackage("react", "react-dom", "react-router", "react-router-dom", "scheduler"))
            return "react";
          if (inPackage("@tanstack/react-query", "@tanstack/query-core")) return "query";
          if (inPackage("zod", "react-hook-form", "@hookform/resolvers")) return "forms";
          if (inPackage("lucide-react")) return "icons";
          // the 3D viewer is loaded on demand and stays out of the main bundle
        },
      },
    },
  },
  // the production build, served locally with production headers and the same /api proxy
  preview: { headers: securityHeaders, proxy: { "/api": API, "/static": API } },
  server: {
    port: 5173,
    // Lets a tunnel (`npm run share`) reach the dev server from a phone. Vite refuses
    // unknown Host headers by default, which is the right default for everything else.
    allowedHosts: [".trycloudflare.com", ".ngrok-free.app", ".ngrok.app", ".loca.lt"],
    // The browser talks to one origin in dev. That keeps the refresh-token cookie
    // first-party and means no CORS setup while developing.
    proxy: {
      "/api": API,
      "/static": API,
    },
  },
});
