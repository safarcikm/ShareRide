import { base } from "@shareride/config/eslint";
import expoConfig from "eslint-config-expo/flat.js";
import { defineConfig } from "eslint/config";

export default defineConfig(
  expoConfig,
  base,
  { ignores: ["dist/**", ".expo/**", "expo-env.d.ts", "web-build/**"] },
  {
    // eslint-plugin-react cannot detect the React version under ESLint 10,
    // so it is set here; keep it in step with package.json.
    settings: { react: { version: "19.3" } },
  },
  {
    // Expo's resolver plugin does not follow the @/ alias or .ts imports in
    // workspace packages; TypeScript already checks both.
    rules: { "import/no-unresolved": "off" },
  },
);
