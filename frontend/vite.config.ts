import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import basicSsl from "@vitejs/plugin-basic-ssl";
import path from "path";
import { componentTagger } from "lovable-tagger";

// The live Takamol backend (Railway) sends no CORS headers, so the browser
// must not call it directly. We proxy same-origin /takamol-api/* to
// https://takamol-api.up.railway.app/api/* — in the dev
// server AND the preview server (production builds served locally). Vercel
// does the same in production via vercel.json rewrites.
const takamolProxy = {
  "/takamol-api": {
    target: "https://takamol-api.up.railway.app",
    changeOrigin: true,
    secure: true,
    rewrite: (p: string) => p.replace(/^\/takamol-api/, ""),
  },
};

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
      proxy: takamolProxy,
    },
    preview: {
      host: "::",
      port: 4173,
      proxy: takamolProxy,
    },
    plugins: [react(), useHttps && basicSsl(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
