import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import typescript from "typescript-eslint";

export default defineConfig([
  { files: ["**/*.ts"], extends: [js.configs.recommended, typescript.configs.recommended] },
  { files: ["**/*.mjs"], extends: [js.configs.recommended] },
  globalIgnores([".next/**", "coverage/**", "next-env.d.ts"]),
]);
