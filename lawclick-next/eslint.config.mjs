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
    ".next-playwright/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Non-source artifacts:
    "playwright-report/**",
    "test-results/**",
    "lint-results.json",
    "lint.log",
    "lint_full.txt",
    // Prisma v7 generated client (output to src/ for Next bundling)
    "src/generated/**",
  ]),
  // Allow CommonJS require() in Node scripts.
  {
    files: ["**/*.js", "**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // 极限标准：禁止 any，禁止“先压 warning 后补”的做法。
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
