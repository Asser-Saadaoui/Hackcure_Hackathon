import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev proxy to the Sahhanito backend. In production Caddy serves the built app and the API on the
// same origin, so the app always calls relative /api URLs.
const BACKEND = process.env.SAHHANITO_BACKEND ?? "http://localhost:8100";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: {
    port: 5173,
    proxy: { "/api": { target: BACKEND, changeOrigin: true }, "/p": { target: BACKEND, changeOrigin: true } },
  },
});
