/**
 * Colour + contrast maths for `audit-contrast-pairs.ts`. Pure — no filesystem.
 *
 * `theme-app.css` writes every colour as `light-dark(<light>, <dark>)`, usually
 * behind a `var()` hop (`--primary-foreground: var(--theme-button-text)`). To
 * grade a PAIR the audit has to resolve both of those, so this module is a tiny
 * resolver for exactly that vocabulary: hex, rgb(), hsl(), `var()` chains and
 * `light-dark()`. Anything outside it (a gradient, `color-mix`, an `rgba` with
 * alpha below 1) resolves to `null` and the pair is reported as UNRESOLVED
 * rather than silently passing.
 */

export type RGB = [number, number, number];
export type Mode = "light" | "dark";

/** `--name: value;` declarations of ONE block, comments removed. */
export function parseDeclarations(body: string): Map<string, string> {
  const out = new Map<string, string>();
  const clean = body.replace(/\/\*[\s\S]*?\*\//g, " ");
  // A declaration may hold `;` only inside parentheses (url(), light-dark()). Walk depth.
  let depth = 0;
  let start = 0;
  const push = (chunk: string) => {
    const m = /^\s*(--[\w-]+)\s*:\s*([\s\S]+?)\s*$/.exec(chunk);
    if (m) out.set(m[1], m[2]);
  };
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    else if (ch === ";" && depth === 0) {
      push(clean.slice(start, i));
      start = i + 1;
    }
  }
  push(clean.slice(start));
  return out;
}

/**
 * The body of EVERY top-level `selector { … }` block whose selector equals
 * `selector` exactly (brace-matched, so nested at-rules inside don't end it
 * early). theme-app.css declares `html.theme-app` twice: the `--theme-*` tokens
 * and, further down, the shadcn bridge — a token lookup needs both.
 */
export function blockBodies(css: string, selector: string): string[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
  const out: string[] = [];
  const re = new RegExp(`(^|[}\\s;])${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`, "g");
  for (const m of src.matchAll(re)) {
    const open = m.index! + m[0].length - 1;
    let depth = 0;
    for (let i = open; i < src.length; i += 1) {
      if (src[i] === "{") depth += 1;
      else if (src[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          out.push(src.slice(open + 1, i));
          break;
        }
      }
    }
  }
  return out;
}

/** Split `a, b(c, d)` on its top-level commas. */
function splitTop(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === "(") depth += 1;
    else if (s[i] === ")") depth -= 1;
    else if (s[i] === "," && depth === 0) {
      parts.push(s.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(s.slice(start).trim());
  return parts;
}

/** Substitute `var(--x)` and pick the `light-dark()` side for `mode`. Returns a plain colour string, or null. */
export function resolveValue(
  raw: string,
  decls: Map<string, string>,
  mode: Mode,
  depth = 0,
): string | null {
  if (depth > 12) return null;
  let v = raw.trim();

  for (let guard = 0; guard < 24; guard += 1) {
    const vm = /var\(\s*(--[\w-]+)\s*(?:,([^()]*))?\)/.exec(v);
    if (!vm) break;
    const target = decls.get(vm[1]);
    const rep = target != null ? resolveValue(target, decls, mode, depth + 1) : (vm[2]?.trim() ?? null);
    if (rep == null) return null;
    v = v.slice(0, vm.index) + rep + v.slice(vm.index + vm[0].length);
  }

  const ld = /light-dark\(/.exec(v);
  if (ld) {
    // Find the matching close paren of this light-dark(
    let depthP = 0;
    let end = -1;
    for (let i = ld.index + "light-dark".length; i < v.length; i += 1) {
      if (v[i] === "(") depthP += 1;
      else if (v[i] === ")") {
        depthP -= 1;
        if (depthP === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) return null;
    const [light, dark] = splitTop(v.slice(ld.index + "light-dark(".length, end));
    if (light === undefined || dark === undefined) return null;
    const pick = mode === "light" ? light : dark;
    return resolveValue(v.slice(0, ld.index) + pick + v.slice(end + 1), decls, mode, depth + 1);
  }
  return v;
}

/** Opaque colour → RGB. null for anything with alpha < 1 or an unknown form. */
export function parseColor(input: string): RGB | null {
  const s = input.trim().toLowerCase();
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    if (h.length === 8 && parseInt(h.slice(6), 16) < 255) return null;
    if (h.length !== 6 && h.length !== 8) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(s);
  if (m) {
    if (m[4] !== undefined) {
      const a = m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      if (a < 1) return null;
    }
    return [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3])];
  }
  m = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(s);
  if (m) {
    if (m[4] !== undefined) {
      const a = m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      if (a < 1) return null;
    }
    const h = (((+m[1] % 360) + 360) % 360) / 360;
    const sat = +m[2] / 100;
    const l = +m[3] / 100;
    const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
    const p = 2 * l - q;
    const hue = (t: number) => {
      let x = t;
      if (x < 0) x += 1;
      if (x > 1) x -= 1;
      if (x < 1 / 6) return p + (q - p) * 6 * x;
      if (x < 1 / 2) return q;
      if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
      return p;
    };
    return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)].map((c) => Math.round(c * 255)) as RGB;
  }
  const named: Record<string, RGB> = { white: [255, 255, 255], black: [0, 0, 0] };
  return named[s] ?? null;
}

export function luminance([r, g, b]: RGB): number {
  const lin = (c: number) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2 contrast ratio, 1–21. */
export function contrastRatio(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export interface PairSpec {
  /** Foreground token, e.g. `--primary-foreground`. */
  fg: string;
  /** Background token, e.g. `--primary`. */
  bg: string;
  /** Minimum ratio. Text = 4.5; large text / UI components = 3. */
  min: number;
}

export interface PairResult extends PairSpec {
  mode: Mode;
  ratio: number | null;
  ok: boolean;
  /** Why `ratio` is null. */
  reason?: string;
}

export function gradePair(spec: PairSpec, decls: Map<string, string>, mode: Mode): PairResult {
  const fgRaw = decls.get(spec.fg);
  const bgRaw = decls.get(spec.bg);
  if (fgRaw == null || bgRaw == null) {
    return { ...spec, mode, ratio: null, ok: false, reason: `${fgRaw == null ? spec.fg : spec.bg} is not declared` };
  }
  const fg = resolveValue(fgRaw, decls, mode);
  const bg = resolveValue(bgRaw, decls, mode);
  const fgC = fg ? parseColor(fg) : null;
  const bgC = bg ? parseColor(bg) : null;
  if (!fgC || !bgC) {
    return { ...spec, mode, ratio: null, ok: false, reason: `unresolved (${fg ?? "?"} on ${bg ?? "?"})` };
  }
  const ratio = contrastRatio(fgC, bgC);
  return { ...spec, mode, ratio, ok: ratio >= spec.min };
}
