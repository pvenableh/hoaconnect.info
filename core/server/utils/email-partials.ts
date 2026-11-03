/**
 * MJML partial composition (Earnest parity round 3, Phase 4). The partials in
 * core/server/emails/ are imported as strings (core/build/raw-mjml.ts) and
 * filled here:
 *
 *   {{name}}                     the value, inserted as is (callers escape)
 *   {{#if name}} … {{else}} … {{/if}}   on a truthy value; nests
 *   {{!-- note --}}              stripped, with its line
 *
 * One pass: a value is never scanned again, so an author's `{{first_name}}`
 * in the body reaches the merge step untouched. A name the partial uses but
 * the caller didn't pass throws — a typo in a partial is a failed render, not
 * an email that says "undefined".
 *
 * `composeEmail` drops the filled header, content and footer into the layout's
 * `<!-- @HEADER -->`, `<!-- @CONTENT -->` and `<!-- @FOOTER -->` slots.
 */
import layoutMjml from "../emails/_layout.mjml";
import headerMjml from "../emails/_header.mjml";
import footerMjml from "../emails/_footer.mjml";

export type PartialVars = Record<string, string | number | boolean | null | undefined>;

export const PARTIALS = { layout: layoutMjml, header: headerMjml, footer: footerMjml } as const;

const COMMENT_RE = /^[ \t]*\{\{!--[\s\S]*?--\}\}[ \t]*\r?\n?/gm;
// The innermost #if block: no nested `{{#if` inside it.
const IF_RE = /\{\{#if (\w+)\}\}((?:(?!\{\{#if )[\s\S])*?)\{\{\/if\}\}/;
const VAR_RE = /\{\{(\w+)\}\}/g;

/** Fill one partial with `vars`. */
export function fillPartial(source: string, vars: PartialVars, name = "partial"): string {
  let s = source.replace(COMMENT_RE, "");
  const has = (k: string) => {
    if (!(k in vars)) throw new Error(`[email-partials] ${name}: no value for {{#if ${k}}}`);
    return !!vars[k];
  };
  for (let m = IF_RE.exec(s); m; m = IF_RE.exec(s)) {
    const [whole, key, body] = m as unknown as [string, string, string];
    const [yes, no = ""] = splitElse(body);
    s = s.slice(0, m.index) + (has(key) ? yes : no) + s.slice(m.index + whole.length);
  }
  return s.replace(VAR_RE, (_, k: string) => {
    if (!(k in vars)) throw new Error(`[email-partials] ${name}: no value for {{${k}}}`);
    const v = vars[k];
    return v == null || v === false ? "" : String(v);
  });
}

function splitElse(body: string): [string, string?] {
  const i = body.indexOf("{{else}}");
  return i < 0 ? [body] : [body.slice(0, i), body.slice(i + "{{else}}".length)];
}

/** The layout with its three slots filled. Slot text is not scanned again. */
export function composeEmail(
  layoutVars: PartialVars,
  slots: { header: string; content: string; footer: string },
  layout: string = PARTIALS.layout
): string {
  const filled = fillPartial(layout, layoutVars, "_layout");
  const bySlot: Record<string, string> = { HEADER: slots.header, CONTENT: slots.content, FOOTER: slots.footer };
  return filled.replace(/<!-- @(HEADER|CONTENT|FOOTER) -->/g, (_, k: string) => bySlot[k]!);
}
