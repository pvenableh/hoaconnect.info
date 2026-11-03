/**
 * Lets server code `import layout from "../emails/_layout.mjml"` — the email
 * partials are inlined into Nitro's bundle as strings (core/build/raw-mjml.ts
 * says why that and not `serverAssets`), and the types learn that a `.mjml`
 * import is a string (in the app project too: it reaches the templates through
 * type imports).
 */
import { addTypeTemplate, defineNuxtModule } from "nuxt/kit";
import { rawMjml } from "../build/raw-mjml";

export default defineNuxtModule({
  meta: { name: "raw-mjml" },
  setup(_options, nuxt) {
    nuxt.hook("nitro:config", (config) => {
      config.rollupConfig ||= {};
      const plugins = config.rollupConfig.plugins;
      config.rollupConfig.plugins = [...(Array.isArray(plugins) ? plugins : plugins ? [plugins] : []), rawMjml() as any];
    });
    addTypeTemplate(
      {
        filename: "types/raw-mjml.d.ts",
        getContents: () => `declare module "*.mjml" {\n  const source: string;\n  export default source;\n}\n`,
      },
      { nitro: true, nuxt: true, node: true }
    );
  },
});
