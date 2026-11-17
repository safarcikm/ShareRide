import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { tokenStylesheet } from "./src/theme/token-stylesheet.ts";

/** `import "virtual:tokens.css"`: the shared design tokens as CSS variables. */
function tokens(): Plugin {
  const id = "virtual:tokens.css";
  const resolved = `\0${id}`;
  return {
    name: "shareride-tokens",
    resolveId: (source) => (source === id ? resolved : undefined),
    load: (loaded) => (loaded === resolved ? tokenStylesheet() : undefined),
  };
}

// The API serves the build at /admin (ADR 0028). In development, Vite serves
// it at http://localhost:5173/admin/ and passes /admin/v1 on to the API; set
// ADMIN_ORIGIN=http://localhost:5173 for the API, so passkeys match.
export default defineConfig({
  base: "/admin/",
  plugins: [react(), tokens()],
  server: { port: 5173, strictPort: true, proxy: { "/admin/v1": "http://localhost:3000" } },
  build: { outDir: "dist", sourcemap: false },
  test: {
    // The browser journeys in e2e/ run with Playwright (pnpm e2e).
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["./src/testing/setup.ts"],
    restoreMocks: true,
    // Screen tests render the whole console; on a busy CI runner the longest
    // forms take several seconds (about 7 times as long as locally), as the
    // app's do (apps/mobile/jest.config.js).
    testTimeout: 15_000,
  },
});
