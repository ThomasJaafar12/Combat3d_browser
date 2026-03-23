import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const chunkSizeWarningLimitKb = 850;

const resolveManualChunk = (id: string): string | undefined => {
  const normalizedId = id.replace(/\\/g, "/");

  if (normalizedId.includes("/src/components/AttachmentEditorViewport")) {
    return "attachment-editor";
  }

  if (!normalizedId.includes("/node_modules/")) {
    return undefined;
  }

  if (normalizedId.includes("/react-dom/") || normalizedId.includes("/react/") || normalizedId.includes("/scheduler/")) {
    return "vendor-react";
  }

  if (normalizedId.includes("/@react-three/drei/")) {
    return "vendor-r3f-drei";
  }

  if (normalizedId.includes("/@react-three/fiber/")) {
    return "vendor-r3f";
  }

  if (normalizedId.includes("/three/examples/jsm/loaders/")) {
    return "vendor-three-loaders";
  }

  if (normalizedId.includes("/three/examples/jsm/utils/")) {
    return "vendor-three-utils";
  }

  if (normalizedId.includes("/three/examples/jsm/")) {
    return "vendor-three-extras";
  }

  if (normalizedId.includes("/three/")) {
    return "vendor-three";
  }

  return "vendor-misc";
};

export default defineConfig({
  publicDir: path.resolve(__dirname, "../assets"),
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: chunkSizeWarningLimitKb,
    rollupOptions: {
      output: {
        manualChunks: resolveManualChunk,
      },
    },
  },
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
