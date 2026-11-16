/**
 * Shared runtime for the `scripts/audit-*.ts` gates (Phase 8).
 *
 * Every audit has the same shape, so the shape lives here once:
 *
 *   • REPORT mode (default) — print the count against the baseline and exit 0.
 *     Safe to run any time; `--list` shows every finding, `--json` is machine
 *     readable, `--top` ranks the worst files.
 *   • `--check` — the gate. Exits 1 when the count is ABOVE the baseline (a
 *     ratchet) or non-zero for a gate-at-0. This is what `.husky/pre-commit`
 *     and CI run, through `pnpm audit:all`.
 *
 * ⚠️ NEVER raise a BASELINE to make a commit pass. A ratchet only ever goes
 * down. If a finding is genuine and cannot be fixed, tag it with the audit's
 * `allow-*` marker and write the reason beside it.
 *
 * The matchers themselves are PURE functions in `audit-matchers.ts`, so
 * `tests/scripts/audit-matchers.test.ts` can table-test them without running
 * git or touching the tree.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export interface Finding {
  file: string;
  line: number;
  text: string;
  /** Optional sub-bucket (a class name, a rule) used by `--top`. */
  key?: string;
}

/** Tracked files matching the pathspecs — `git ls-files` so build output never lands in a census. */
export function trackedFiles(globs: string[]): string[] {
  const out = execSync(`git ls-files ${globs.map((g) => `"${g}"`).join(" ")}`, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split("\n").filter(Boolean);
}

export function readRepoFile(file: string): string {
  return readFileSync(path.join(ROOT, file), "utf8");
}

/**
 * Vendored shadcn-vue parts. They are copied in, re-copied on upgrade, and ARE
 * the primitives the other audits tell people to use — so the component-hygiene
 * audits skip them rather than flag the thing they recommend.
 */
export const VENDORED_UI = "app/components/ui/";
export const isVendoredUi = (file: string) => file.startsWith(VENDORED_UI);

/**
 * Blank comment bodies with spaces (newlines kept) so a finding's line number
 * stays exact and prose ABOUT a problem never lands in the count.
 *   vue → `<!-- -->` in the template; `/* *\/` and `//` inside <script>;
 *         `/* *\/` inside <style>
 *   ts  → `/* *\/` and `//`
 *   css → `/* *\/`
 *
 * ⚠️ A comment opener only counts where its language has comments. The old
 * version ran one `/\*[\s\S]*?(?:\*\/|$)/` over the whole SFC, so the `/*` in
 * `accept="image/*"` (template text) or `"/api/*"` (a script string) opened an
 * "unclosed comment" that blanked THE REST OF THE FILE — every audit silently
 * skipped everything after it (found 2026-11-16). Now a template only ever
 * loses `<!-- -->`, and script/style are scanned left to right so a string or
 * regex literal is stepped over before anything inside it can open a comment.
 */
export function blankComments(src: string, kind: "vue" | "ts" | "css"): string {
  const out = src.split("");
  const blank = (from: number, to: number) => {
    for (let i = from; i < to && i < out.length; i += 1) if (out[i] !== "\n") out[i] = " ";
  };
  if (kind === "ts") blankCodeComments(src, 0, src.length, "js", blank);
  else if (kind === "css") blankCodeComments(src, 0, src.length, "css", blank);
  else {
    // Same block split as `templateOnly` in audit-matchers.ts.
    let at = 0;
    for (const m of src.matchAll(/<(script|style)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
      const bodyStart = m.index! + m[0].indexOf(">") + 1;
      blankHtmlComments(src, at, m.index!, blank);
      blankCodeComments(src, bodyStart, bodyStart + m[2]!.length, m[1] === "script" ? "js" : "css", blank);
      at = m.index! + m[0].length;
    }
    blankHtmlComments(src, at, src.length, blank);
  }
  return out.join("");
}

type Blank = (from: number, to: number) => void;

/** `<!-- -->` in `src[from, to)`; an unclosed one runs to `to`, never past it. */
function blankHtmlComments(src: string, from: number, to: number, blank: Blank) {
  for (const m of src.slice(from, to).matchAll(/<!--[\s\S]*?(?:-->|$)/g)) {
    blank(from + m.index!, from + m.index! + m[0].length);
  }
}

/** A `/` after one of these (or at the start) begins a regex literal, not a division. */
const REGEX_AFTER = new Set("(,=:[!&|?{};+-*%<>~^".split(""));
const REGEX_KEYWORD =
  /(?:^|[^\w$.])(?:return|typeof|case|in|of|void|delete|throw|new|else|do|yield|await|instanceof)\s*$/;

/**
 * Blank `/* *\/` (and, for JS, `//`) comments in `src[from, to)`, stepping over
 * strings, template literals (with their `${…}` holes) and regex literals.
 * A quote that never closes ends with its line, so one odd character cannot
 * swallow the rest of a block the way an unclosed `/*` used to.
 */
function blankCodeComments(src: string, from: number, to: number, lang: "js" | "css", blank: Blank) {
  const js = lang === "js";
  /** Brace depth of each enclosing `${…}` hole; empty = not inside a template literal. */
  const holes: number[] = [];
  let depth = 0;
  /** Last significant code character — decides regex literal vs. division. */
  let prev = "";

  /** From inside a template literal: index after its closing backtick, or just inside a `${`. */
  const templateFrom = (k: number): number => {
    while (k < to) {
      const c = src[k];
      if (c === "\\") k += 2;
      else if (c === "`") return k + 1;
      else if (c === "$" && src[k + 1] === "{") {
        holes.push(depth);
        depth = 0;
        return k + 2;
      } else k += 1;
    }
    return to;
  };
  /** From an opening quote: index after the closing one, or the end of its line. */
  const quotedFrom = (k: number, q: string): number => {
    for (k += 1; k < to; k += 1) {
      const c = src[k];
      if (c === "\\") k += 1;
      else if (c === q) return k + 1;
      else if (c === "\n") return k;
    }
    return to;
  };
  /** From a regex literal's opening `/`: index after its closing `/`, or the end of its line. */
  const regexFrom = (k: number): number => {
    let inClass = false;
    for (k += 1; k < to; k += 1) {
      const c = src[k];
      if (c === "\\") k += 1;
      else if (c === "\n") return k;
      else if (inClass) inClass = c !== "]";
      else if (c === "[") inClass = true;
      else if (c === "/") return k + 1;
    }
    return to;
  };

  let i = from;
  while (i < to) {
    const c = src[i]!;
    const n = src[i + 1];
    if (c === "/" && n === "*") {
      const close = src.indexOf("*/", i + 2);
      const end = close === -1 || close + 2 > to ? to : close + 2;
      blank(i, end);
      i = end;
    } else if (js && c === "/" && n === "/") {
      const nl = src.indexOf("\n", i);
      const end = nl === -1 || nl > to ? to : nl;
      blank(i, end);
      i = end;
    } else if (c === '"' || c === "'") {
      i = quotedFrom(i, c);
      prev = c;
    } else if (js && c === "`") {
      i = templateFrom(i + 1);
      prev = "`";
    } else if (js && c === "/" && (prev === "" || REGEX_AFTER.has(prev) || REGEX_KEYWORD.test(src.slice(Math.max(from, i - 16), i)))) {
      i = regexFrom(i);
      prev = "/";
    } else if (c === "\\") {
      i += 2;
    } else {
      if (js && holes.length && c === "}" && depth === 0) {
        depth = holes.pop()!;
        i = templateFrom(i + 1);
        prev = "`";
        continue;
      }
      if (c === "{") depth += 1;
      else if (c === "}" && depth > 0) depth -= 1;
      if (!/\s/.test(c)) prev = c;
      i += 1;
    }
  }
}

/** Is `marker` in a comment on line `i` or within `lookback` lines above it? */
export function hasMarker(raw: string[], i: number, marker: string, lookback = 2): boolean {
  const re = new RegExp(`(//|<!--|/\\*|\\*|#).*?${marker}`);
  for (let back = 0; back <= lookback; back += 1) {
    if (re.test(raw[i - back] ?? "")) return true;
  }
  return false;
}

/** 1-based line number of a character offset. */
export function lineAt(src: string, offset: number): number {
  let n = 1;
  for (let i = 0; i < offset; i += 1) if (src.charCodeAt(i) === 10) n += 1;
  return n;
}

export interface AuditResult {
  /** Audit name, as in `pnpm audit:<name>`. */
  name: string;
  /** Script file, for the "lower BASELINE in …" hint. */
  script: string;
  /** The ratchet. 0 = a gate. */
  baseline: number;
  findings: Finding[];
  /** One-line summary of what was tagged/skipped (printed in the pass line). */
  note?: string;
  /** How to fix a finding — printed on failure. */
  fix: string[];
}

const argv = process.argv.slice(2);
export const flags = {
  check: argv.includes("--check"),
  list: argv.includes("--list"),
  json: argv.includes("--json"),
  top: argv.includes("--top"),
};

/** Print, then set the exit code. Returns true when the audit passed. */
export function finish(r: AuditResult): boolean {
  const n = r.findings.length;
  const over = n > r.baseline;

  if (flags.json) {
    console.log(JSON.stringify({ name: r.name, baseline: r.baseline, count: n, findings: r.findings }, null, 2));
    if (flags.check && over) process.exitCode = 1;
    return !over;
  }

  if (flags.list) {
    for (const f of r.findings) console.log(`  ${f.file}:${f.line}  ${f.text}`);
    console.log("");
  }

  if (flags.top) {
    const byFile = new Map<string, number>();
    for (const f of r.findings) byFile.set(f.file, (byFile.get(f.file) ?? 0) + 1);
    for (const [file, c] of [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
      console.log(`  ${String(c).padStart(5)}  ${file}`);
    }
    console.log("");
  }

  const kind = r.baseline === 0 ? "gate at 0" : `ratchet at ${r.baseline}`;
  if (over) {
    console.error(`\n✗ ${r.name} audit: ${n} findings (${kind}) — ${n - r.baseline} over.`);
    for (const line of r.fix) console.error(`  ${line}`);
    console.error("  Run with --list to see every finding. NEVER raise the baseline to make a commit pass.\n");
    if (flags.check) process.exitCode = 1;
    return false;
  }

  const lower =
    n < r.baseline ? `\n  Nice — lower BASELINE in scripts/${r.script} to ${n} (a ratchet only goes down).` : "";
  console.log(`\n✓ ${r.name} audit: ${n} (${kind}) — no regression.${r.note ? `\n  ${r.note}` : ""}${lower}`);
  return true;
}

export interface FileAuditOptions {
  name: string;
  script: string;
  baseline: number;
  /** `git ls-files` pathspecs. */
  globs: string[];
  /** Files to skip (vendored primitives, token-definition files, public surfaces). */
  exclude?: (file: string) => boolean;
  /** One file's source → hits (and how many were tagged with the allow marker). */
  scan: (src: string, file: string) => { hits: { line: number; text: string; key?: string }[]; allowed: number };
  fix: string[];
  /** Extra text for the pass line. */
  note?: string;
}

/** The common case: scan every tracked file with a pure matcher, report against the baseline. */
export function runFileAudit(o: FileAuditOptions): AuditResult {
  const files = trackedFiles(o.globs).filter((f) => !o.exclude?.(f));
  const findings: Finding[] = [];
  let allowed = 0;
  for (const file of files) {
    const r = o.scan(readRepoFile(file), file);
    allowed += r.allowed;
    for (const h of r.hits) findings.push({ file, line: h.line, text: h.text, key: h.key });
  }
  const result: AuditResult = {
    name: o.name,
    script: o.script,
    baseline: o.baseline,
    findings,
    fix: o.fix,
    note: [`${files.length} files scanned`, allowed ? `${allowed} tagged allow-*` : null, o.note]
      .filter(Boolean)
      .join(" · "),
  };
  finish(result);
  return result;
}
