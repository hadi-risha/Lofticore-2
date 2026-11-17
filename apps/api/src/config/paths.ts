import path from "node:path";

// Static files (seed photos, local uploads) live in apps/api/public. The server is always
// started from the apps/api folder (npm scripts, Docker WORKDIR and tests all do), so
// this path is the same whether the code runs from src/ or from the bundled dist/.
export const PUBLIC_DIR = path.resolve(process.cwd(), "public");
