import { defineConfig } from "tsup";

// Bundles the API into one file for production. Our own shared package is bundled in
// (it's TypeScript source); everything from npm stays a normal dependency.
export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  target: "node20",
  clean: true,
  sourcemap: true,
  noExternal: ["@lofticore/shared"],
});
