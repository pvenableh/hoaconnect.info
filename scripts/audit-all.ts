#!/usr/bin/env npx tsx
/**
 * Runs every UI/code audit as a gate (`--check`) and fails if ANY is red.
 * This is the one command `.husky/pre-commit` and CI call, so adding an audit
 * means adding it to AUDITS below — nowhere else.
 *
 *   pnpm audit:all           # all gates, one line each; failures print their detail
 *   pnpm audit:all --list    # same, plus each audit's own summary
 *
 * Audits run in parallel (each is an independent `tsx` process reading git).
 * `unresolved-components` needs `.nuxt/components.d.ts` (`npx nuxt prepare`).
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const AUDITS = [
  "hairline-surfaces",
  "native-dialogs",
  "raw-date-inputs",
  "color-literals",
  "css-colors",
  "dead-theme-classes",
  "unresolved-components",
  "contrast-pairs",
  "heading-labels",
  "raw-buttons",
  "type-scale",
  "overlay-boxes",
  "settings-boxes",
  "empty-states",
  "vue-global",
  "detached-promises",
] as const;

const verbose = process.argv.includes("--list");

function run(name: string): Promise<{ name: string; code: number; out: string }> {
  return new Promise((resolve) => {
    const child = spawn("npx", ["tsx", `scripts/audit-${name}.ts`, "--check"], { cwd: ROOT });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ name, code: code ?? 1, out: out.trim() }));
  });
}

const results = await Promise.all(AUDITS.map(run));
let failed = 0;
for (const r of results) {
  const first = r.out.split("\n").find((l) => /^[✓✗]/.test(l)) ?? r.out.split("\n")[0] ?? "";
  console.log(`${r.code === 0 ? "✓" : "✗"} ${r.name.padEnd(22)} ${first.replace(/^[✓✗]\s*[\w-]+ audit:\s*/, "")}`);
  if (r.code !== 0) {
    failed += 1;
    console.log(r.out.split("\n").map((l) => `    ${l}`).join("\n"));
  } else if (verbose) {
    console.log(r.out.split("\n").map((l) => `    ${l}`).join("\n"));
  }
}
console.log(failed ? `\n✗ ${failed} of ${AUDITS.length} audits red.` : `\n✓ all ${AUDITS.length} audits green.`);
process.exit(failed ? 1 : 0);
