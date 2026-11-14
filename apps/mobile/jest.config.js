import expoPreset from "jest-expo/jest-preset.js";

// jest-expo transforms React Native packages; FormatJS ships only ES modules,
// so it is added to the packages Jest compiles. Lucide hands React Native an
// .mjs file, which Jest does not compile, so tests use its CommonJS build.
const [nodeModulesPattern, ...otherPatterns] = expoPreset.transformIgnorePatterns;

/** @type {import('jest').Config} */
export default {
  preset: "jest-expo",
  testPathIgnorePatterns: ["/node_modules/", "/e2e/"],
  // Screen tests render the whole app; the first one in a file can pass 5 s
  // when every package's checks run at once (pnpm check).
  testTimeout: 15_000,
  moduleNameMapper: {
    "^lucide-react-native$":
      "<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js",
    // The real SDK starts timers as soon as it loads; tests check calls to it.
    "^@sentry/react-native$": "<rootDir>/src/testing/sentry.ts",
  },
  transformIgnorePatterns: [
    nodeModulesPattern.replace("(.pnpm|", "(.pnpm|intl-messageformat|@formatjs|"),
    ...otherPatterns,
  ],
};
