/**
 * Per-route Vercel function settings — today one route: the send queue's tick,
 * `/api/email/cron/continue-sends`, gets `maxDuration: 60`.
 *
 * Why a module: Nitro 2.13's Vercel preset builds every route into ONE function
 * (`functions/__fallback.func`) whose settings come from `nitro.vercel.functions`
 * — global. Lowering that to 60 s would cap every route (the project runs on
 * Fluid compute, 300 s by default), and a `functions` entry in vercel.json does
 * not match a Nitro route at all (Vercel looks for source files under `api/`).
 * Newer Nitro has `vercel.functionRules` for exactly this; until the upgrade,
 * this does the same after the preset has written its output: it copies the
 * fallback function to the route's own path with its own `.vc-config.json`.
 * The Build Output API serves a function at its directory's path in the
 * `filesystem` phase, ahead of Nitro's catch-all to `/__fallback`.
 *
 * The queue's safety does not hang on this alone: a run stops claiming after
 * 45 s and never delivers another run's claimed rows (docs/spec-email-send-queue.md
 * §4); the hard stop makes the 3-minute stale window a 3× margin.
 * TICK_MAX_DURATION_S in email-send-constants.ts names the same number.
 *
 * No-op outside the `vercel` preset (local builds, tests).
 */
import { defineNuxtModule } from "nuxt/kit";
import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const VERCEL_FUNCTION_RULES: Record<string, { maxDuration: number }> = {
  "/api/email/cron/continue-sends": { maxDuration: 60 },
};

export default defineNuxtModule({
  meta: { name: "vercel-function-rules" },
  setup(_options, nuxt) {
    nuxt.hook("nitro:init", (nitro) => {
      // Registered after the preset's own `compiled` hook, so it runs after the
      // fallback function and its .vc-config.json exist.
      nitro.hooks.hook("compiled", async () => {
        if (!String(nitro.options.preset || "").startsWith("vercel") || nitro.options.preset === "vercel-edge") return;
        const fallback = nitro.options.output.serverDir;
        const functionsDir = dirname(fallback);
        const base = JSON.parse(await readFile(join(fallback, ".vc-config.json"), "utf8"));
        for (const [route, config] of Object.entries(VERCEL_FUNCTION_RULES)) {
          const dir = join(functionsDir, `${route.replace(/^\/+/, "")}.func`);
          await rm(dir, { recursive: true, force: true });
          await cp(fallback, dir, { recursive: true, verbatimSymlinks: true });
          await writeFile(join(dir, ".vc-config.json"), JSON.stringify({ ...base, ...config }, null, 2));
          console.info(`[vercel-function-rules] ${route} → own function, ${JSON.stringify(config)}`);
        }
      });
    });
  },
});
