import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  root: "app",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: "app/index.html",
        landcover: "app/land-cover-viewer.html",
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});
