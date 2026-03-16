import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  publicDir: path.resolve(__dirname, "../assets"),
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    fs: {
      allow: [path.resolve(__dirname, "..")],
    },
  },
});
