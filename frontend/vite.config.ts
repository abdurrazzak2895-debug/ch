import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import basicSsl from "@vitejs/plugin-basic-ssl";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const useHttps = process.env.VITE_DEV_HTTPS === "true" || process.env.npm_lifecycle_event === "start:https";

  return {
    server: {
      host: "::",
      // Keep the dev origin aligned with the API's local CORS allowlist.
      port: 3000,
      allowedHosts: true,
      https: useHttps,
      hmr: {
        overlay: false,
      },
      // The live Takamol backend (Railway) sends no CORS headers. In
      // production the frontend now routes through the `takamol-proxy`
      // Supabase edge function instead of calling Railway directly (see
      // src/lib/takamol-api.ts). This local proxy is kept only as a manual
      // escape hatch for testing directly against Railway in dev — it's
      // unused unless VITE_TAKAMOL_API_URL is explicitly set to
      // "/takamol-api".
      proxy: {
        "/takamol-api": {
          target: "https://takamol-api.up.railway.app",
          changeOrigin: true,
          secure: true,
          rewrite: (p) => p.replace(/^\/takamol-api/, ""),
        },
      },
    },
    plugins: [react(), useHttps && basicSsl(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
