import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: "index.html",
        landcover: "land-cover-viewer.html",
        detection: "detection.html",
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});
