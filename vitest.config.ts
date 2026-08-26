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
    // Vitest's 5s default assumes a test body does test-shaped work. A test
    // that cold-imports a heavy module graph does not: the two org-scope files
    // spent 1.9-2.1s of their first `it()` on the import alone, and under
    // 8-way fork parallelism that lost the race against 5s.
    //
    // Losing it does not fail honestly. Vitest abandons a timed-out test but
    // cannot cancel it, so the abandoned work lands in the NEXT test's
    // freshly-cleared state and that test is the one that fails — with an
    // assertion implicating the code under test rather than the clock. Both
    // files now warm their graph in `beforeAll`, so this is headroom rather
    // than the fix; it is only ever spent when something is genuinely stuck.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
