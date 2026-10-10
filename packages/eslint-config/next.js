import { FlatCompat } from "@eslint/eslintrc";
import base from "./base.js";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...compat.extends("next/core-web-vitals"),
  // Keep typescript-eslint parser/rules after Next so .ts/.tsx stay type-aware.
  ...base,
];
