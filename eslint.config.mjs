import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Build output, never edited by hand — see CLAUDE.md "Sources vs build
    // artefacts".
    //
    // This was implicit until uploads arrived: `public/` held only JSON, which
    // nothing lints. It now also holds the pdf.js worker copied there by
    // `scripts/build-assets.mts`, and linting a 1.2 MB minified vendor bundle
    // produced 1,573 warnings that buried every real one.
    "public/**",
    "lib/generated/**",
  ]),
]);

export default eslintConfig;
