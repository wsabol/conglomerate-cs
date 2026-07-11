import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

// The React app lives in src/client and builds to dist/client, which the
// Worker serves via the ASSETS binding. During development, run `wrangler dev`
// (the Worker/API on :8787) alongside `vite` (:5173) and API calls are proxied.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      includeAssets: [
        "ico/favicon-16x16.png",
        "ico/favicon-32x32.png",
        "ico/apple-touch-icon.png",
      ],
      manifest: {
        name: "The Conglomerate",
        short_name: "Conglomerate",
        description: "A private chronological archive of the band's shows, parties, recordings, people, and stories.",
        theme_color: "#080a09",
        background_color: "#080a09",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "ico/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "ico/pwa-256x256.png",
            sizes: "256x256",
            type: "image/png",
          },
          {
            src: "ico/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "ico/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/, /^\/media/],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: "NetworkOnly",
          },
          {
            urlPattern: /^\/media\//,
            handler: "NetworkOnly",
          },
        ],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
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
