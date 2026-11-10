/**
 * Node module hooks for the tsx workers (billing, digest, data export, …).
 *
 * The workers import app modules, and two things those modules rely on exist
 * only inside Nuxt (and vitest, which re-declares them):
 *   - the `#core/…` alias (core/nuxt.config.ts; vitest.config.ts mirrors it), and
 *   - `.mjml` imports as strings (core/build/raw-mjml.ts, a rollup plugin).
 * Plain tsx has neither, so since the email templates started using both
 * (c1c6397, 2026-11-03) the billing and digest workers died on import in CI.
 *
 * Every worker script in package.json runs as
 *   tsx --import ./scripts/lib/worker-loader.mjs scripts/<worker>.ts
 * and tests/server/worker-imports.test.ts fails if a worker can't load.
 */
import { register } from "node:module";

register("./worker-loader-hooks.mjs", import.meta.url);
