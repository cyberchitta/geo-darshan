import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    files: ["app/js/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
        L: "readonly",
        parseGeoraster: "readonly",
        GeoRasterLayer: "readonly",
        alert: "readonly",
        confirm: "readonly",
        localStorage: "readonly",
        performance: "readonly",
        setTimeout: "readonly",
        clearInterval: "readonly",
        setInterval: "readonly",
        Blob: "readonly",
        File: "readonly",
        FileReader: "readonly",
        URL: "readonly",
        tf: "readonly",
        GeoTIFF: "readonly",
      },
    },
    rules: {
      "no-unused-vars": "warn",
      "no-console": "off",
      "prefer-const": "error",
      "no-var": "error",
      eqeqeq: "error",
      "no-trailing-spaces": "error",
      semi: ["error", "always"],
      quotes: ["error", "double"],
      "no-undef": "error",
    },
  },
  {
    files: ["app/**/*.svelte"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {},
  },
];
