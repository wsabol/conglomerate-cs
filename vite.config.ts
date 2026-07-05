import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// The React app lives in src/client and builds to dist/client, which the
// Worker serves via the ASSETS binding. During development, run `wrangler dev`
// (the Worker/API on :8787) alongside `vite` (:5173) and API calls are proxied.
export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, "src/client"),
  publicDir: path.resolve(__dirname, "src/client/public"),
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "src/shared"),
      "@client": path.resolve(__dirname, "src/client"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "dist/client"),
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8787",
      "/media": "http://localhost:8787",
    },
  },
});
