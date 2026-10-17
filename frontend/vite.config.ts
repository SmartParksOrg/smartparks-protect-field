/// <reference types="vitest/config" />
import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

// The frontend reads the repository root .env so there is one env file for the whole program.
const envDir = path.resolve(import.meta.dirname, "..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, "VITE_");
  // the local server (protect_go/main.py); VITE_PROXY_TARGET points elsewhere when needed
  const proxyTarget = env.VITE_PROXY_TARGET || "http://127.0.0.1:18090";
  return {
    envDir,
    plugins: [react(), tailwindcss()],
    worker: { format: "es" },
    resolve: {
      alias: { "@": path.resolve(import.meta.dirname, "./src") },
    },
    server: {
      host: "127.0.0.1",
      port: 5173,
      proxy: {
        "/api": { target: proxyTarget, changeOrigin: true },
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/test/setup.ts"],
      css: false,
    },
  };
});
