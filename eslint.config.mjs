import js from "@eslint/js";
import globals from "globals";

export default [
  {
    files: ["**/*.js", "**/*.mjs"],
    ...js.configs.recommended,
    languageOptions: { globals: { ...globals.browser, ...globals.node } }
  }
];
