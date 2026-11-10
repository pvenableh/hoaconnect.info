/**
 * The hooks registered by worker-loader.mjs (they run on Node's loader thread).
 * Kept to exactly what Nuxt and vitest do, so a worker sees the same modules.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/** The repository root: this file is scripts/lib/worker-loader-hooks.mjs. */
const ROOT = new URL("../../", import.meta.url);

/** `#core/x` → `<root>/core/x`, the alias core/nuxt.config.ts defines. */
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("#core/")) {
    return nextResolve(fileURLToPath(new URL(specifier.slice(1), ROOT)), context);
  }
  return nextResolve(specifier, context);
}

/** `.mjml` → `export default "<file text>"`, as core/build/raw-mjml.ts does. */
export async function load(url, context, nextLoad) {
  if (url.startsWith("file:") && url.split("?")[0].endsWith(".mjml")) {
    const source = await readFile(new URL(url), "utf8");
    return { format: "module", source: `export default ${JSON.stringify(source)};`, shortCircuit: true };
  }
  return nextLoad(url, context);
}
