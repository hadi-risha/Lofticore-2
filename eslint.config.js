import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "graphify-out/**",
      "apps/api/public/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      // underscore-prefixed names are the "I know this is unused" convention
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // `any` hides bugs; allow it only where it's been thought about
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": ["warn", { allow: ["error", "warn"] }],
    },
  },

  // server and shared code
  {
    files: ["apps/api/**/*.ts", "packages/**/*.ts", "e2e/**/*.ts", "*.config.*"],
    languageOptions: { globals: globals.node },
  },

  // scripts are command-line tools, so they may print
  { files: ["apps/api/src/scripts/**/*.ts"], rules: { "no-console": "off" } },
  { files: ["apps/api/src/config/env.ts"], rules: { "no-console": "off" } },

  // the web app
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },

  // tests can be looser
  {
    files: ["**/tests/**/*.ts", "e2e/**/*.ts"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off", "no-console": "off" },
  },
);
