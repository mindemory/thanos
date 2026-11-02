import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// eslint-config-next brings eslint-plugin-jsx-a11y (MIT) and turns on six of its rules. Thanos
// takes the plugin's whole recommended set, from the copy Next registers: a second copy beside
// it would clash with it, and the plugin's own peer range stops short of this ESLint.
const jsxA11y = nextVitals.find((config) => config.plugins?.["jsx-a11y"])?.plugins["jsx-a11y"];
if (!jsxA11y) throw new Error("eslint-config-next no longer registers jsx-a11y: add the plugin here");

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  { name: "thanos/jsx-a11y", files: ["**/*.{jsx,tsx}"], rules: jsxA11y.flatConfigs.recommended.rules },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
