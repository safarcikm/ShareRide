import expoPreset from "jest-expo/jest-preset.js";

// jest-expo transforms React Native packages; FormatJS ships only ES modules,
// so it is added to the packages Jest compiles. Lucide hands React Native an
// .mjs file, which Jest does not compile, so tests use its CommonJS build.
const [nodeModulesPattern, ...otherPatterns] = expoPreset.transformIgnorePatterns;

/** @type {import('jest').Config} */
export default {
  preset: "jest-expo",
  testPathIgnorePatterns: ["/node_modules/", "/e2e/"],
  moduleNameMapper: {
    "^lucide-react-native$":
      "<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js",
  },
  transformIgnorePatterns: [
    nodeModulesPattern.replace("(.pnpm|", "(.pnpm|intl-messageformat|@formatjs|"),
    ...otherPatterns,
  ],
};
