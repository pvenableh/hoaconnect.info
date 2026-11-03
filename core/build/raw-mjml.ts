/**
 * Import `.mjml` files as strings (Earnest parity round 3, Phase 4: the email
 * partials in core/server/emails/). A rollup/vite plugin, used by Nitro's
 * server bundle (core/modules/raw-mjml.ts) and by vitest (vitest.config.ts).
 *
 * Why not Nitro `serverAssets`: on Vercel, Earnest's came back empty at runtime
 * (the assets were not traced into the function). Inlining the source into the
 * bundle at build time has nothing to trace.
 */
export function rawMjml() {
  return {
    name: "raw-mjml",
    enforce: "pre" as const,
    transform(code: string, id: string) {
      if (!id.split("?")[0]!.endsWith(".mjml")) return null;
      return { code: `export default ${JSON.stringify(code)};`, map: null };
    },
  };
}
