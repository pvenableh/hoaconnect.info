/**
 * postcss-solid-surfaces — the in-app "Solid surfaces" switch answers every
 * Reduce Transparency and Increase Contrast rule, without writing them twice.
 *
 * Ported from Earnest (scripts/postcss-solid-surfaces.ts, 2026-11-27) for
 * docs/plan-apple-platform-direction.md session 2. Why: Earnest found on an
 * iPhone that iOS exposes neither setting to a page (`prefers-contrast` reads
 * no-preference with Increase Contrast on; `prefers-reduced-transparency`
 * never matches). HOA Connect's own probe (`public/media-probe.html`) checks
 * the same here. So the app carries its own switch (`useSolidSurfaces`), which
 * sets `data-a11y-solid` on <html>.
 *
 * What it does: for every `@media` whose query list has a query using
 * `(prefers-reduced-transparency: reduce)` or `(prefers-contrast: more)`, it
 * emits a copy of the block's rules gated on the attribute instead:
 *
 *   @media (prefers-reduced-transparency: reduce) { .x { … } }
 *   → also  :where(html[data-a11y-solid]) .x { … }
 *
 *   @media (prefers-contrast: more) { :root { … } }
 *   → also  :root:where([data-a11y-solid]) { … }
 *
 * A selector whose first compound is the root (`html…`, `:root…`, `.dark`,
 * `.light`, or `[data-tint…]` — all set on <html> here) gets the attribute
 * added to that compound; anything else is prefixed with the root. Unlike
 * Earnest, a bare `[data-…]` is not the root: `[data-slot="dialog-overlay"]`
 * and its kin sit on the element itself, and treating them as <html> left the
 * dialog scrims blurred under the switch (found 2026-11-27, plan session 2).
 * Both forms go through `:where()`, so the copy has exactly the specificity of
 * the original and wins or loses the same fights. Any other conditions in the
 * query (`and (min-width: …)`) stay as an `@media` around the copy. The
 * original block is untouched, so a browser that does report the setting keeps
 * working with the switch off.
 *
 * Wired in core/nuxt.config.ts `postcss.plugins`; it sees every stylesheet and
 * every Vue `<style>` block, so a new Reduce Transparency rule is covered with
 * no extra step.
 */
import type { AtRule, ChildNode, Container, PluginCreator, Rule } from 'postcss';

export const SOLID_ATTR = 'data-a11y-solid';

const FEATURE_RE = /\(\s*(?:prefers-reduced-transparency\s*:\s*reduce|prefers-contrast\s*:\s*more)\s*\)/i;
const ROOT_COMPOUND_RE = /^(?:html|:root|\.dark|\.light|\[data-tint)/;

/** Split on commas that are not inside parentheses or brackets. */
function splitTopLevel(input: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < input.length; i++) {
		const c = input[i];
		if (c === '(' || c === '[') depth++;
		else if (c === ')' || c === ']') depth--;
		else if (c === ',' && depth === 0) {
			out.push(input.slice(start, i));
			start = i + 1;
		}
	}
	out.push(input.slice(start));
	return out.map((s) => s.trim()).filter(Boolean);
}

/** The query with our feature taken out: '' when nothing else remains, null when it never used it. */
function remainderOf(query: string): string | null {
	if (/^\s*not\b/i.test(query) || !FEATURE_RE.test(query)) return null;
	return query
		.replace(new RegExp(`\\s*\\band\\s*${FEATURE_RE.source}`, 'gi'), '')
		.replace(new RegExp(`${FEATURE_RE.source}\\s*\\band\\b\\s*`, 'gi'), '')
		.replace(new RegExp(FEATURE_RE.source, 'gi'), '')
		.replace(/^\s*only\s+/i, '')
		.trim()
		.replace(/^(?:all|screen)$/i, '');
}

/** Index just past the first compound selector (the first top-level combinator). */
function firstCompoundEnd(sel: string): number {
	let depth = 0;
	for (let i = 0; i < sel.length; i++) {
		const c = sel[i];
		if (c === '(' || c === '[') depth++;
		else if (c === ')' || c === ']') depth--;
		else if (depth === 0 && (c === ' ' || c === '>' || c === '+' || c === '~')) return i;
	}
	return sel.length;
}

export function gateSelector(sel: string): string {
	const s = sel.trim();
	const end = firstCompoundEnd(s);
	const first = s.slice(0, end);
	// A root-only selector (`html:root { … }`) or a root compound before a descendant.
	if (ROOT_COMPOUND_RE.test(first)) {
		const pseudoEl = first.indexOf('::');
		if (pseudoEl === -1) return `${first}:where([${SOLID_ATTR}])${s.slice(end)}`;
	}
	return `:where(html[${SOLID_ATTR}]) ${s}`;
}

function gateRules(nodes: ChildNode[]): ChildNode[] {
	return nodes.map((n) => {
		const copy = n.clone();
		const gate = (r: Rule) => {
			const parent = r.parent as AtRule | undefined;
			if (parent?.type === 'atrule' && /keyframes$/i.test(parent.name)) return;
			r.selectors = r.selectors.map(gateSelector);
		};
		if (copy.type === 'rule') gate(copy);
		if ('walkRules' in copy) (copy as Container).walkRules(gate);
		return copy;
	});
}

const seen = new WeakSet<AtRule>();

const plugin: PluginCreator<Record<string, never>> = () => ({
	postcssPlugin: 'postcss-solid-surfaces',
	AtRule: {
		media(atRule) {
			if (seen.has(atRule)) return;
			seen.add(atRule);
			const remainders = new Set<string>();
			for (const q of splitTopLevel(atRule.params)) {
				const r = remainderOf(q);
				if (r !== null) remainders.add(r);
			}
			if (!remainders.size || !atRule.nodes?.length) return;
			// A query left with nothing but our feature makes every other remainder redundant.
			const list = remainders.has('') ? [''] : [...remainders];
			let anchor: ChildNode = atRule;
			for (const rest of list) {
				const copies = gateRules(atRule.nodes);
				if (rest === '') {
					anchor.after(copies);
					anchor = copies[copies.length - 1] ?? anchor;
				} else {
					const wrapped = atRule.clone({ params: rest, nodes: [] });
					seen.add(wrapped);
					wrapped.append(copies);
					anchor.after(wrapped);
					anchor = wrapped;
				}
			}
		},
	},
});
plugin.postcss = true;

export default plugin;
