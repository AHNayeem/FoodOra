import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Tooling that is not part of the app: installed skill/plugin scripts are
    // CommonJS helpers run by the editor, not modules Next ever bundles, so the
    // app's TypeScript rules do not apply to them.
    ".claude/**",
  ]),
]);

export default eslintConfig;
