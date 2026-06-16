import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      // Nuxt 4 srcDir layout: `~`/`@` → app/, `~~`/`@@` → project root
      "~": resolve(__dirname, "app"),
      "@": resolve(__dirname, "app"),
      "~~": resolve(__dirname),
      "@@": resolve(__dirname),
    },
  },
  test: {
    globals: true,
    environment: "happy-dom",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
  },
});
