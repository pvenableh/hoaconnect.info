import { describe, it, expect } from "vitest";
import { blankComments } from "../../scripts/lib/audit-kit";
import {
  findBoxes,
  findColorLiterals,
  findDeadThemeClasses,
  findNativeDialogs,
  findRawButtons,
  findRawTypeSizes,
} from "../../scripts/lib/audit-matchers";

/**
 * `blankComments` is what every audit reads through, so a wrong opener there
 * hides findings in EVERY audit at once. The bug this pins (found 2026-11-16):
 * one whole-file `/\*…(?:\*\/|$)/` regex read the `/*` in `accept="image/*"` as
 * an unclosed block comment and blanked the rest of the file, so the audits
 * silently skipped everything after the first file input.
 */

/** Same length and the same newline positions, so every line number survives. */
function expectShapeKept(src: string, out: string) {
  expect(out).toHaveLength(src.length);
  expect(out.split("\n").map((l) => l.length)).toEqual(src.split("\n").map((l) => l.length));
}

describe("blankComments — a template's /* is text", () => {
  const sfc = [
    "<template>",
    '  <input type="file" accept="image/*,application/pdf" />',
    '  <button class="text-[13px] text-gray-500">Upload</button>',
    "</template>",
  ].join("\n");

  it("keeps everything after accept=\"image/*\"", () => {
    const out = blankComments(sfc, "vue");
    expectShapeKept(sfc, out);
    expect(out).toBe(sfc);
  });

  it("still reports the finding after it, in every kind of audit", () => {
    expect(findRawButtons(sfc).hits.map((h) => h.line)).toEqual([3]);
    expect(findRawTypeSizes(sfc).hits.map((h) => h.line)).toEqual([3]);
    expect(findColorLiterals(sfc).hits.map((h) => h.line)).toEqual([3]);
  });

  it("does not let a later box hide behind it", () => {
    const src = [
      "<template>",
      "  <Card>",
      '    <input type="file" accept="image/*" />',
      "  </Card>",
      "  <Card>second</Card>",
      "</template>",
    ].join("\n");
    expect(findBoxes(src).findings.map((f) => f.line)).toEqual([2, 5]);
  });

  it("keeps template text that merely looks like a comment", () => {
    const src = "<template>\n  <p>a // b /* c</p>\n  <p class=\"bg-white\">x</p>\n</template>";
    expect(blankComments(src, "vue")).toBe(src);
    expect(findColorLiterals(src).hits.map((h) => h.line)).toEqual([3]);
  });

  it("still blanks real HTML comments, an unclosed one only to the end of the template", () => {
    const src = [
      "<template>",
      '  <!-- <p class="bg-white"> -->',
      "  <!-- unclosed",
      '  <p class="bg-white">',
      "</template>",
      "<script setup>",
      'confirm("still scanned");',
      "</script>",
    ].join("\n");
    const out = blankComments(src, "vue");
    expectShapeKept(src, out);
    expect(out).not.toContain("bg-white");
    expect(findNativeDialogs(src).hits.map((h) => h.line)).toEqual([7]);
  });
});

describe("blankComments — <script> and <style>", () => {
  it("blanks // and /* */ in a script, and nothing in the template", () => {
    const src = [
      "<template><p>// kept</p></template>",
      "<script setup lang=\"ts\">",
      "// gone",
      "const a = 1; /* gone */ const b = 2;",
      "</script>",
    ].join("\n");
    const out = blankComments(src, "vue");
    expectShapeKept(src, out);
    expect(out).toContain("<p>// kept</p>");
    expect(out).not.toContain("gone");
    expect(out).toContain("const b = 2;");
  });

  it("reads a script string's /* as a string", () => {
    const src = [
      "<script setup lang=\"ts\">",
      'const accept = computed(() => (props.files ? "*/*" : "image/*"));',
      'if (window.confirm("Delete?")) go();',
      "</script>",
    ].join("\n");
    expect(blankComments(src, "vue")).toBe(src);
    expect(findNativeDialogs(src).hits.map((h) => h.line)).toEqual([3]);
  });

  it("ends a // comment at its line, even when it mentions /*", () => {
    const src = ["// routes under /api/ai/*", 'alert("visible")', "/** later */"].join("\n");
    const out = blankComments(src, "ts");
    expect(out.split("\n")[1]).toBe('alert("visible")');
    expect(findNativeDialogs(src, "ts").hits.map((h) => h.line)).toEqual([2]);
  });

  it("blanks /* */ in a style block but keeps a quoted /*", () => {
    const src = [
      "<style scoped>",
      '.a::before { content: "/*"; }',
      "/* gone */",
      ".b { font-size: 13px; }",
      "</style>",
    ].join("\n");
    const out = blankComments(src, "vue");
    expect(out).toContain('content: "/*"');
    expect(out).not.toContain("gone");
    expect(findRawTypeSizes(src).hits.map((h) => h.line)).toEqual([4]);
  });
});

describe("blankComments — strings, template literals and regexes (ts)", () => {
  const cases: [string, string, string[], string[]][] = [
    ["a quoted //", `const u = "a // b"; // gone`, ["a // b"], ["gone"]],
    ["a quoted /*", `const g = '/*'; /* gone */ x();`, ["'/*'", "x();"], ["gone"]],
    ["a URL", `const u = 'https://x.dev'; // gone`, ["https://x.dev"], ["gone"]],
    ["a template literal and its hole", "const t = `a /* ${'*/'} b`; /* gone */", ["`a /* ${'*/'} b`"], ["gone"]],
    ["nested template literals", "const t = `x ${`/*`} y`; // gone", ["`x ${`/*`} y`"], ["gone"]],
    ["a regex with an escaped /*", String.raw`const r = /\/\*/; /* gone */ y();`, [String.raw`/\/\*/`, "y();"], ["gone"]],
    ["a regex with a quote in a class", `const r = /["']/g; // gone`, [`/["']/g`], ["gone"]],
    ["a regex after return", "function f() { return /\\/*x/.test(s); } // gone", ["return /\\/*x/.test(s);"], ["gone"]],
    ["division is not a regex", "const h = a / b; // gone", ["a / b;"], ["gone"]],
  ];
  it.each(cases)("%s", (_n, src, kept, gone) => {
    const out = blankComments(src, "ts");
    expectShapeKept(src, out);
    for (const k of kept) expect(out).toContain(k);
    for (const g of gone) expect(out).not.toContain(g);
  });

  it("ends an unterminated quote with its line", () => {
    const src = ["const s = \"oops;", "/* gone */", "const t = 1;"].join("\n");
    const out = blankComments(src, "ts");
    expect(out).not.toContain("gone");
    expect(out).toContain("const t = 1;");
  });

  it("blanks an unclosed /* to the end of the source, as before", () => {
    const src = "a();\n/* never closed\nb();";
    expect(blankComments(src, "ts")).toBe(`a();\n${" ".repeat(15)}\n${" ".repeat(4)}`);
  });

  it("dead-theme-classes reads a .ts file's comments as comments", () => {
    const defined = new Set<string>();
    const src = ['// className = "t-gone"', "/* class: 't-gone-too' */", 'const className = "t-nope";'].join("\n");
    expect(findDeadThemeClasses(src, defined, undefined, true).hits.map((h) => h.line)).toEqual([3]);
  });
});

describe("blankComments — css", () => {
  it("blanks block comments and keeps strings", () => {
    const src = '.a { content: "/* not a comment */"; } /* gone */ .b { color: red; }';
    const out = blankComments(src, "css");
    expectShapeKept(src, out);
    expect(out).toContain('"/* not a comment */"');
    expect(out).not.toContain("gone");
    expect(out).toContain(".b { color: red; }");
  });
});
