/**
 * The tsx workers must be able to load. They import app modules that use the
 * `#core/…` alias and `.mjml` imports, which only Nuxt and vitest provide;
 * scripts/lib/worker-loader.mjs provides them for tsx.
 *
 * Without it the billing and digest workers died on import in GitHub Actions
 * from 2026-11-03 (c1c6397) until this test was added, and nothing here
 * noticed: vitest has the alias and the .mjml plugin, so every unit test
 * passed. So this runs the real CLI, in a child process, the way CI does.
 *
 * Each worker gets a dead Directus URL (port 9 is refused before any network)
 * and `--dry-run`, so it loads, starts, and fails at its first request.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../..");
const TSX = join(ROOT, "node_modules/.bin/tsx");
const LOADER = "./scripts/lib/worker-loader.mjs";
const ENV = {
  PATH: process.env.PATH ?? "",
  HOME: process.env.HOME ?? "",
  DIRECTUS_URL: "http://127.0.0.1:9",
  DIRECTUS_STATIC_TOKEN: "test",
};
const LOAD_FAILURE =
  /ERR_PACKAGE_IMPORT_NOT_DEFINED|ERR_UNKNOWN_FILE_EXTENSION|ERR_MODULE_NOT_FOUND|Cannot find (module|package)|SyntaxError/;

const run = (args: string[]) =>
  spawnSync(TSX, ["--import", LOADER, ...args], { cwd: ROOT, env: ENV, encoding: "utf8", timeout: 90_000 });

const WORKERS = ["billing-worker", "notification-digest-worker", "data-export-worker"];

describe("tsx workers load", () => {
  it.each(WORKERS)("%s gets past its imports", (worker) => {
    const r = run([`scripts/${worker}.ts`, "--dry-run", "--max", "0"]);
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.error).toBeUndefined();
    expect(out).not.toMatch(LOAD_FAILURE);
  }, 120_000);

  it("renders a branded email through the loader (.mjml as text, #core resolved)", () => {
    const code = `
      const { buildEmailHtml } = await import("./core/server/utils/email-templates-mjml.ts");
      const html = buildEmailHtml({
        organization: { id: "o", name: "Oak Court", slug: "oak", settings: null },
        subject: "Hello", content: "<p>Body text</p>", emailType: "notice",
      });
      console.log(JSON.stringify({ html: html.includes("<html"), body: html.includes("Body text"), mj: /<mj-/.test(html) }));
    `;
    const r = run(["--input-type=module", "-e", code]);
    expect(`${r.stderr}`).not.toMatch(LOAD_FAILURE);
    const last = r.stdout.trim().split("\n").pop() ?? "";
    expect(JSON.parse(last)).toEqual({ html: true, body: true, mj: false });
  }, 120_000);

  it("every worker script in package.json runs with the loader", () => {
    const scripts = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts as Record<string, string>;
    const workers = Object.entries(scripts).filter(([, cmd]) => /tsx .*scripts\/[\w-]*worker\.ts/.test(cmd));
    expect(workers.map(([name]) => name).sort()).toEqual(["billing:worker", "digest:worker", "export:worker"]);
    for (const [name, cmd] of workers) expect(cmd, name).toContain(`--import ${LOADER}`);
  });
});
