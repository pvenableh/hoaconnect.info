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
      // Shared core layer (mirrors the `#core` alias defined in core/nuxt.config.ts).
      // vitest does not read Nuxt config, so it needs the alias declared here too.
      "#core": resolve(__dirname, "core"),
    },
  },
  test: {
    globals: true,
    environment: "happy-dom",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
  },
});
