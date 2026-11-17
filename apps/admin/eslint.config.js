import { base } from "@shareride/config/eslint";
import { defineConfig } from "eslint/config";
import globals from "globals";

export default defineConfig(base, {
  files: ["src/**/*.{ts,tsx}"],
  languageOptions: { globals: globals.browser },
});
