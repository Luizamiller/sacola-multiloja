import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// mode "demo": build estático para o GitHub Pages, com o backend rodando no navegador (src/demo)
export default defineConfig(({ mode }) => ({
  base: mode === "demo" ? "/umami/" : "/",
  worker: { format: "es" },
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { proxy: { "/api": "http://127.0.0.1:8104" } },
  preview: { proxy: { "/api": "http://127.0.0.1:8104" } },
  build: { target: "es2022", chunkSizeWarningLimit: 400 },
  test: { globals: true, environment: "jsdom", setupFiles: ["./src/test/setup.ts"], include: ["src/**/*.test.{ts,tsx}"] },
}));
