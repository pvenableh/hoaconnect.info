import { describe, it, expect } from "vitest";
import {
  definedClasses,
  findBareEmptyStates,
  findBoxes,
  findBrokenGlobals,
  findColorLiterals,
  findCssColors,
  findDeadThemeClasses,
  findDetachedPromises,
  findHeadingLabels,
  findNativeDialogs,
  findRawButtons,
  findRawDateInputs,
  findRawTypeSizes,
  findUnresolvedComponents,
  overlayRegion,
  parseComponentNames,
} from "../../scripts/lib/audit-matchers";
import {
  blockBodies,
  contrastRatio,
  gradePair,
  parseColor,
  parseDeclarations,
  resolveValue,
} from "../../scripts/lib/contrast";
import { blankComments, hasMarker } from "../../scripts/lib/audit-kit";

/**
 * Phase 8 — every audit's PURE matcher gets a table: a hit, a near miss, and the
 * allow marker. The audits themselves are proved on the real tree (and by a
 * deliberate violation); these keep a regex tweak from quietly turning a gate
 * vacuous, which is exactly how the round-2 hairline regex matched nothing.
 */

const sfc = (tpl: string, extra = "") => `<template>\n${tpl}\n</template>\n${extra}`;

describe("blankComments / hasMarker", () => {
  it("blanks comments but keeps line numbers and URLs", () => {
    const src = "a // gone\nconst u = 'https://x.dev'; /* gone\nstill */ b";
    const out = blankComments(src, "ts");
    expect(out.split("\n")).toHaveLength(3);
    expect(out).toContain("https://x.dev");
    expect(out).not.toContain("gone");
  });
  it("finds a marker on the line or within lookback above", () => {
    const raw = ["// allow-x: because", "", "foo()"];
    expect(hasMarker(raw, 2, "allow-x", 2)).toBe(true);
    expect(hasMarker(raw, 2, "allow-x", 1)).toBe(false);
  });
});

describe("native-dialogs", () => {
  const cases: [string, string, number][] = [
    ["bare confirm with a string", `if (confirm("Delete?")) go();`, 1],
    ["bare prompt with a template", "const n = prompt(`Name for ${x}`)", 1],
    ["window.alert", `window.alert("hi")`, 1],
    ["useConfirm's confirm takes an OBJECT", `await confirm({ title: "Delete?" })`, 0],
    ["a method named confirm", `dialog.confirm("x")`, 0],
    ["a declaration", `function confirm(a) { return a }`, 0],
    ["documentation: window.confirm() with empty parens", `<code>window.confirm()</code>`, 0],
    ["in a comment", `// confirm("nope")`, 0],
  ];
  it.each(cases)("%s", (_n, src, count) => {
    expect(findNativeDialogs(src, "ts").hits).toHaveLength(count);
  });
  it("honours allow-native-dialog", () => {
    const r = findNativeDialogs(`// allow-native-dialog: legacy embed\nconfirm("x")`, "ts");
    expect(r.hits).toHaveLength(0);
    expect(r.allowed).toBe(1);
  });
});

describe("raw-date-inputs", () => {
  const cases: [string, string, number][] = [
    ["type=date", `<input type="date" v-model="d" />`, 1],
    ["datetime-local", `<input type='datetime-local' />`, 1],
    ["bound :type", `<input :type="'date'" />`, 1],
    ["type=text is fine", `<input type="text" />`, 0],
    ["type=time is out of scope", `<input type="time" />`, 0],
    ["an attribute that merely ends in 'type'", `<Foo input-type="date" />`, 0],
  ];
  it.each(cases)("%s", (_n, src, count) => {
    expect(findRawDateInputs(src).hits).toHaveLength(count);
  });
  it("honours the marker", () => {
    expect(findRawDateInputs(`<!-- allow-raw-date-input: print form -->\n<input type="date">`).allowed).toBe(1);
  });
});

describe("color-literals", () => {
  const cases: [string, string, number][] = [
    ["text-gray-500", `<p class="text-gray-500">`, 1],
    ["bg-emerald-600", `<div class="bg-emerald-600 p-2">`, 1],
    ["hover variant still caught", `class="hover:bg-red-100"`, 1],
    ["bg-white", `<div class="bg-white">`, 1],
    ["semantic token is fine", `<p class="text-destructive t-text-muted bg-success/15">`, 0],
    ["a class that merely contains the words", `<p class="gray-matter text-grayscale">`, 0],
    ["no rung, no palette class", `<p class="text-red">`, 0],
    ["in a comment", `<!-- bg-red-500 -->`, 0],
  ];
  it.each(cases)("%s", (_n, src, count) => {
    expect(findColorLiterals(src).hits).toHaveLength(count);
  });
  it("honours allow-color-literal", () => {
    expect(findColorLiterals(`<!-- allow-color-literal: brand swatch -->\n<i class="bg-blue-500">`).allowed).toBe(1);
  });
});

describe("css-colors", () => {
  const cases: [string, string, number][] = [
    ["hex in a rule", `.a { color: #fff; }`, 1],
    ["rgba in a rule", `.a { background: rgba(0,0,0,.5); }`, 1],
    ["token definition is exempt", `  --theme-bg: light-dark(#fff, #000);`, 0],
    ["var() use is fine", `.a { color: var(--theme-text-primary); }`, 0],
    ["rgb(var(...)) is fine", `.a { color: rgb(var(--x) / 0.5); }`, 0],
    ["url(#id) is not a colour", `.a { fill: url(#grad); }`, 0],
    ["comment", `/* #fff */`, 0],
  ];
  it.each(cases)("%s", (_n, src, count) => {
    expect(findCssColors(src).hits).toHaveLength(count);
  });
  it("offsets line numbers by the style block start", () => {
    expect(findCssColors(`\n.a { color: #fff; }`, 10).hits[0]!.line).toBe(11);
  });
  it("honours allow-css-color", () => {
    expect(findCssColors(`/* allow-css-color: printed design */\n.a { color: #fff; }`).allowed).toBe(1);
  });
});

describe("dead-theme-classes", () => {
  const defined = definedClasses(`
    .t-text-primary { color: red; }
    .hover\\:t-bg-subtle:hover { }
    .ios-card, .glass-edge::before { }
    @utility type-label { }
    /* .t-in-comment { } */
  `.replace(/\\:/g, ":"));
  it("collects selectors and @utility, not comments", () => {
    expect(defined.has("t-text-primary")).toBe(true);
    expect(defined.has("ios-card")).toBe(true);
    expect(defined.has("type-label")).toBe(true);
    expect(defined.has("t-in-comment")).toBe(false);
  });
  const cases: [string, string, number][] = [
    ["defined class", `<p class="t-text-primary">`, 0],
    ["undefined class", `<p class="t-card-flat p-2">`, 1],
    ["variant prefix checks the bare class", `<p class="hover:t-nope">`, 1],
    ["two dead classes on one line", `<p class="t-aaa t-bbb">`, 2],
    ["the same dead class twice on a line counts once", `<p class="t-aaa t-aaa">`, 1],
    ["tailwind utilities are not theme classes", `<p class="text-sm tracking-wide type-x-y-z-not">`, 1],
    ["comment", `<!-- class="t-gone" -->`, 0],
    ["template-literal prefix", "<p :class=\"`t-text-${tone}`\">", 0],
  ];
  it.each(cases)("%s", (_n, src, count) => {
    expect(findDeadThemeClasses(src, defined).hits).toHaveLength(count);
  });
  it("strict (script) mode needs the word class on the line", () => {
    expect(findDeadThemeClasses(`const r = ref<"ios-old">(null)`, defined, undefined, true).hits).toHaveLength(0);
    expect(findDeadThemeClasses(`const className = "t-nope"`, defined, undefined, true).hits).toHaveLength(1);
  });
  it("honours allow-dead-class", () => {
    expect(findDeadThemeClasses(`<!-- allow-dead-class: runtime -->\n<p class="t-zz">`, defined).allowed).toBe(1);
  });
});

describe("unresolved-components", () => {
  const known = parseComponentNames(
    [
      `export const AppEmptyState: typeof import("../app/components/App/EmptyState.vue")['default']`,
      `export const LazyAppEmptyState: LazyComponent<typeof import("../x.vue")['default']>`,
      `export const FeedItem: typeof import("../app/components/feed/FeedItem.vue")['default']`,
    ].join("\n"),
  );
  it("parses names and Lazy prefixes", () => {
    expect(known.has("AppEmptyState")).toBe(true);
    expect(known.has("FeedItem")).toBe(true);
  });
  const cases: [string, string, number][] = [
    ["a known component", `<AppEmptyState title="x" />`, 0],
    ["the kebab-case form of a known one", `<app-empty-state />`, 0],
    ["the prefix-duplicated name Nuxt does NOT generate", `<FeedFeedItem :item="i" />`, 1],
    ["a built-in", `<NuxtLink to="/">x</NuxtLink>`, 0],
    ["an html tag", `<div><span>x</span></div>`, 0],
    ["svg tags", `<svg><path d="" /><linearGradient /></svg>`, 0],
    ["markup inside an attribute value is text", `<input placeholder="<mj-body><mj-text>" />`, 0],
    ["a comment", `<!-- <Ghost /> -->`, 0],
  ];
  it.each(cases)("%s", (_n, tpl, count) => {
    expect(findUnresolvedComponents(sfc(tpl), known).hits).toHaveLength(count);
  });
  it("a locally imported component resolves", () => {
    const src = `<script setup>\nimport Local from "./Local.vue";\n</script>\n${sfc("<Local />")}`;
    expect(findUnresolvedComponents(src, known).hits).toHaveLength(0);
  });
  it("honours allow-unresolved-component", () => {
    expect(findUnresolvedComponents(sfc(`<!-- allow-unresolved-component: dynamic -->\n<Ghost />`), known).allowed).toBe(1);
  });
});

describe("heading-labels", () => {
  const cases: [string, string, number][] = [
    ["uppercase + tracking + text-xs", `<h3 class="text-xs uppercase tracking-wide">Group</h3>`, 1],
    ["type-label on a heading", `<h4 class="type-label uppercase">x</h4>`, 1],
    ["a real heading", `<h2 class="text-xl font-semibold">Title</h2>`, 0],
    ["small but not uppercase", `<h3 class="text-xs t-text-muted">x</h3>`, 0],
    ["uppercase but large", `<h1 class="uppercase tracking-wide text-3xl">x</h1>`, 0],
    ["a <p> label is the fix", `<p class="text-xs uppercase tracking-wide">x</p>`, 0],
  ];
  it.each(cases)("%s", (_n, tpl, count) => {
    expect(findHeadingLabels(sfc(tpl)).hits).toHaveLength(count);
  });
  it("honours the marker", () => {
    expect(findHeadingLabels(sfc(`<!-- allow-heading-label: outline needs it -->\n<h3 class="text-xs uppercase">x</h3>`)).allowed).toBe(1);
  });
});

describe("raw-buttons", () => {
  const cases: [string, string, number][] = [
    ["a raw button", `<button type="button" @click="x">Go</button>`, 1],
    ["button on its own line", `<button\n  class="x"\n>`, 1],
    ["the Button component", `<Button variant="outline">Go</Button>`, 0],
    ["a tag that merely starts with button", `<buttonish />`, 0],
    ["in a comment", `<!-- <button> -->`, 0],
  ];
  it.each(cases)("%s", (_n, tpl, count) => {
    expect(findRawButtons(sfc(tpl)).hits).toHaveLength(count);
  });
  it("honours allow-raw-button within two lines", () => {
    expect(findRawButtons(sfc(`<!-- allow-raw-button: calendar cell -->\n<button>x</button>`)).allowed).toBe(1);
  });
});

describe("type-scale", () => {
  const cases: [string, string, number][] = [
    ["text-[13px]", sfc(`<p class="text-[13px]">`), 1],
    ["leading-[15px]", sfc(`<p class="leading-[15px]">`), 1],
    ["two on one line", sfc(`<p class="text-[11px] leading-[14px]">`), 2],
    ["tailwind scale", sfc(`<p class="text-sm leading-6">`), 0],
    ["a type-* class", sfc(`<p class="type-label">`), 0],
    ["rem arbitrary value is not pixels", sfc(`<p class="text-[0.8rem]">`), 0],
    ["font-size in a style block", sfc("<p />", `<style>\n.a { font-size: 13px; }\n</style>`), 1],
    ["font-size via var()", sfc("<p />", `<style>\n.a { font-size: var(--x); }\n</style>`), 0],
  ];
  it.each(cases)("%s", (_n, src, count) => {
    expect(findRawTypeSizes(src).hits).toHaveLength(count);
  });
  it("honours allow-type-px", () => {
    expect(findRawTypeSizes(sfc(`<!-- allow-type-px: icon label -->\n<p class="text-[9px]">`)).allowed).toBe(1);
  });
});

describe("empty-states", () => {
  const cases: [string, string, number][] = [
    ["bare 'No X yet'", `<p class="text-sm">No requests yet.</p>`, 1],
    ["'No X found'", `<div>No documents found</div>`, 1],
    ["inside AppEmptyState", `<AppEmptyState title="No requests yet" description="Create one" />`, 0],
    ["inside a wrapped AppEmptyState", `<AppEmptyState>\n  <template #title>No requests yet</template>\n</AppEmptyState>`, 0],
    ["a search outcome is not an empty collection", `<p>No results found</p>`, 0],
    ["a prop of a component that owns its empty state", `<Chart empty-title="No members yet" />`, 0],
    ["ordinary prose", `<p>No worries.</p>`, 0],
  ];
  it.each(cases)("%s", (_n, tpl, count) => {
    expect(findBareEmptyStates(sfc(tpl)).hits).toHaveLength(count);
  });
  it("honours allow-bare-empty", () => {
    expect(findBareEmptyStates(sfc(`<!-- allow-bare-empty: inline note -->\n<p>No pets on file.</p>`)).allowed).toBe(1);
  });
});

describe("vue-global", () => {
  const cases: [string, string, number][] = [
    ["compound selector after :global() — dropped by the compiler", ".a :global(.dark) .child { color: red }", 1],
    ["whole selector inside :global()", ":global(.dark .child) { color: red }", 0],
    ["a lone :global() rule", ":global(.dark) { color: red }", 0],
    ["a list of :global() selectors", ":global(.a), :global(.b) { color: red }", 0],
  ];
  it.each(cases)("%s", (_n, css, count) => {
    expect(findBrokenGlobals(`<template><i/></template>\n<style scoped>\n${css}\n</style>`).hits).toHaveLength(count);
  });
});

describe("detached-promises", () => {
  const cases: [string, string, number][] = [
    ["void call", `void notifyUsers(x);`, 1],
    ["void call with a catch", `void ingestItem(a, b).catch(() => {});`, 1],
    ["floating .catch statement", `notifyResident(org, cr).catch((e) => log(e));`, 1],
    ["bare waitUntil", `event.waitUntil(work());`, 1],
    ["void 0 is not a detached promise", `const u = void 0;`, 0],
    ["awaited with a catch", `await refresh(id).catch(() => {});`, 0],
    ["returned", `return send(x).catch(() => null);`, 0],
    ["assigned", `const p = send(x).catch(() => null);`, 0],
    ["collected by Promise.all", `rows.map((r) => gen(r).catch(() => []))`, 0],
    ["a continuation line of an awaited chain", `  ).catch(() => null);`, 0],
    ["comment", `// void notify()`, 0],
  ];
  it.each(cases)("%s", (_n, src, count) => {
    expect(findDetachedPromises(src).hits).toHaveLength(count);
  });
  it("honours allow-detached-promise", () => {
    const r = findDetachedPromises(`// allow-detached-promise: best-effort cache warm\nvoid warm();`);
    expect(r.hits).toHaveLength(0);
    expect(r.allowed).toBe(1);
  });
});

describe("nested boxes (overlay-boxes / settings-boxes)", () => {
  const cases: [string, string, number][] = [
    ["ios-card", `<div class="ios-card p-4">`, 1],
    ["Card component", `<Card class="p-4">`, 1],
    ["tinted + radius + padding", `<div class="t-bg-subtle rounded-lg p-4">`, 1],
    ["hand-bordered box", `<div class="border rounded-xl p-3">`, 1],
    ["ios-card--thing is sanctioned", `<div class="ios-card ios-card--thing">`, 0],
    ["a pill", `<span class="border rounded-full p-1">`, 0],
    ["an input", `<input class="border rounded-lg p-2" />`, 0],
    ["a divider", `<div class="border-b py-2">`, 0],
    ["a popover", `<div class="absolute border rounded-lg p-2">`, 0],
  ];
  it.each(cases)("%s", (_n, tpl, count) => {
    expect(findBoxes(sfc(tpl)).findings).toHaveLength(count);
  });
  it("honours allow-nested-box", () => {
    expect(findBoxes(sfc(`<!-- allow-nested-box: receipt -->\n<div class="ios-card">`)).things).toBe(1);
  });
  it("overlayRegion covers the overlay primitive's element only", () => {
    const tpl = [
      `<div class="ios-card">outside</div>`,
      `<AppBottomSheet v-model:open="o">`,
      `  <div class="ios-card">inside</div>`,
      `</AppBottomSheet>`,
    ].join("\n");
    const src = sfc(tpl);
    const found = findBoxes(src, overlayRegion(src)).findings;
    expect(found).toHaveLength(1);
    expect(found[0]!.text).toContain("inside");
  });
});

describe("contrast maths", () => {
  it("parses hex, rgb, hsl; rejects alpha and unknowns", () => {
    expect(parseColor("#fff")).toEqual([255, 255, 255]);
    expect(parseColor("#0f151d")).toEqual([15, 21, 29]);
    expect(parseColor("rgb(0, 122, 163)")).toEqual([0, 122, 163]);
    expect(parseColor("hsl(0 0% 100%)")).toEqual([255, 255, 255]);
    expect(parseColor("rgba(255,255,255,0.5)")).toBeNull();
    expect(parseColor("color-mix(in srgb, red, blue)")).toBeNull();
  });
  it("black on white is 21:1; identical is 1:1", () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 1);
    expect(contrastRatio([9, 9, 9], [9, 9, 9])).toBe(1);
  });
  const css = `
    html.theme-app { --fg: light-dark(#111111, #eeeeee); --bg: light-dark(#ffffff, #000000); --alias: var(--fg);
      --weak: light-dark(#cccccc, #333333); --blend: color-mix(in srgb, red, blue); }
    @media (x) { html.theme-app { --extra: #123456; } }
  `;
  const decls = new Map<string, string>();
  for (const b of blockBodies(css, "html.theme-app")) for (const [k, v] of parseDeclarations(b)) decls.set(k, v);
  it("merges every top-level block of a selector", () => {
    expect(decls.has("--fg")).toBe(true);
  });
  it("resolves var() chains and light-dark() per mode", () => {
    expect(resolveValue("var(--alias)", decls, "light")).toBe("#111111");
    expect(resolveValue("var(--alias)", decls, "dark")).toBe("#eeeeee");
  });
  it("grades a pair in both modes, and fails a weak or unresolvable one", () => {
    expect(gradePair({ fg: "--alias", bg: "--bg", min: 4.5 }, decls, "light").ok).toBe(true);
    expect(gradePair({ fg: "--alias", bg: "--bg", min: 4.5 }, decls, "dark").ok).toBe(true);
    expect(gradePair({ fg: "--weak", bg: "--bg", min: 4.5 }, decls, "light").ok).toBe(false);
    const unresolved = gradePair({ fg: "--blend", bg: "--bg", min: 4.5 }, decls, "light");
    expect(unresolved.ok).toBe(false);
    expect(unresolved.ratio).toBeNull();
    expect(gradePair({ fg: "--missing", bg: "--bg", min: 4.5 }, decls, "light").reason).toMatch(/not declared/);
  });
});
