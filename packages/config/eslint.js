// Shared ESLint configuration. Each package has an eslint.config.js that
// re-exports `base`, and adds `domain` when it must stay pure.
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export const base = defineConfig(
  { ignores: ["dist/**", "coverage/**", ".turbo/**", ".expo/**", "node_modules/**"] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true },
    },
    rules: {
      // Conventions: domain errors are typed results, not exceptions; a thrown
      // value must still be an Error so stack traces survive.
      "@typescript-eslint/only-throw-error": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      eqeqeq: ["error", "always"],
      "no-console": "error",
    },
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
);

const domainMessage =
  "packages/domain is pure: no I/O, framework, clock or randomness (ADR 0004, conventions). Pass time and IDs in as arguments.";

// For packages/domain: no I/O, frameworks, clock or randomness.
export const domain = defineConfig({
  files: ["src/**/*.ts"],
  ignores: ["src/**/*.test.ts"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: [
              "node:*",
              "fs",
              "path",
              "os",
              "http",
              "https",
              "net",
              "crypto",
              "child_process",
              "hono",
              "hono/*",
              "@hono/*",
              "drizzle-orm",
              "drizzle-orm/*",
              "pg",
              "postgres",
              "react",
              "react-*",
              "expo",
              "expo-*",
              "@shareride/*",
            ],
            message: domainMessage,
          },
        ],
      },
    ],
    "no-restricted-globals": [
      "error",
      { name: "fetch", message: domainMessage },
      { name: "process", message: domainMessage },
      { name: "setTimeout", message: domainMessage },
      { name: "setInterval", message: domainMessage },
    ],
    "no-restricted-properties": [
      "error",
      { object: "Date", property: "now", message: domainMessage },
      { object: "Math", property: "random", message: domainMessage },
      { object: "crypto", property: "randomUUID", message: domainMessage },
      { object: "crypto", property: "getRandomValues", message: domainMessage },
    ],
    "no-restricted-syntax": [
      "error",
      {
        selector: "NewExpression[callee.name='Date'][arguments.length=0]",
        message: domainMessage,
      },
    ],
  },
});
