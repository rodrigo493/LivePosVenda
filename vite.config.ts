import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: "./",
  server: {
    host: "0.0.0.0",
    port: 8080,
    hmr: {
      overlay: true,
    },
  },
  build: {
    target: "esnext",
    sourcemap: mode !== "production",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/") || id.includes("node_modules/react-router")) return "vendor";
          if (id.includes("node_modules/@tanstack")) return "query";
          if (id.includes("node_modules/@radix-ui")) return "ui";
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-")) return "charts";
        },
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
