import expoPreset from "jest-expo/jest-preset.js";

// jest-expo transforms React Native packages; FormatJS ships only ES modules,
// so it is added to the packages Jest compiles.
const [nodeModulesPattern, ...otherPatterns] = expoPreset.transformIgnorePatterns;

/** @type {import('jest').Config} */
export default {
  preset: "jest-expo",
  testPathIgnorePatterns: ["/node_modules/", "/e2e/"],
  transformIgnorePatterns: [
    nodeModulesPattern.replace("(.pnpm|", "(.pnpm|intl-messageformat|@formatjs|"),
    ...otherPatterns,
  ],
};
