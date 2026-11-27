import { readFileSync } from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import plugin, { gateSelector } from '../../core/build/postcss-solid-surfaces';

const run = async (css: string) => (await postcss([plugin()]).process(css, { from: undefined })).css;

describe('postcss-solid-surfaces', () => {
	it('gates a plain selector behind the root attribute, at zero added specificity', () => {
		expect(gateSelector('.glass-surface')).toBe(':where(html[data-a11y-solid]) .glass-surface');
	});

	it('adds the attribute to a root compound instead of nesting under it', () => {
		expect(gateSelector('html:root')).toBe('html:root:where([data-a11y-solid])');
		expect(gateSelector('.dark .glass-field')).toBe('.dark:where([data-a11y-solid]) .glass-field');
		expect(gateSelector(':root .glass.glass.glass')).toBe(':root:where([data-a11y-solid]) .glass.glass.glass');
		expect(gateSelector("html[data-theme='clean'].dark .app-rail")).toBe(
			"html[data-theme='clean'].dark:where([data-a11y-solid]) .app-rail",
		);
	});

	it('treats a data-slot selector as the element, not the root', () => {
		expect(gateSelector('[data-slot="dialog-overlay"]')).toBe(':where(html[data-a11y-solid]) [data-slot="dialog-overlay"]');
		expect(gateSelector("[data-tint='off'] .glass-surface")).toBe("[data-tint='off']:where([data-a11y-solid]) .glass-surface");
	});

	it('copies a Reduce Transparency block out of its media query', async () => {
		const out = await run('@media (prefers-reduced-transparency: reduce) { .a, .dark .b { x: y } }');
		expect(out).toContain('@media (prefers-reduced-transparency: reduce) { .a, .dark .b { x: y } }');
		expect(out).toContain(':where(html[data-a11y-solid]) .a, .dark:where([data-a11y-solid]) .b { x: y }');
	});

	it('copies an either-setting block once', async () => {
		const out = await run('@media (prefers-reduced-transparency: reduce), (prefers-contrast: more) { .a { x: y } }');
		expect(out.match(/data-a11y-solid/g)).toHaveLength(1);
	});

	it('keeps the other conditions of the query around the copy', async () => {
		const out = await run('@media (prefers-contrast: more) and (min-width: 768px) { .a { x: y } }');
		expect(out).toMatch(/@media \(min-width: 768px\) \{\s*:where\(html\[data-a11y-solid\]\) \.a \{ x: y \}/);
	});

	it('leaves other media queries and keyframe steps alone', async () => {
		const out = await run(
			'@media (prefers-reduced-transparency: no-preference) { .a { x: y } } @media (prefers-reduced-motion: reduce) { .b { x: y } }',
		);
		expect(out).not.toContain('data-a11y-solid');
		const kf = await run('@media (prefers-contrast: more) { @keyframes k { from { o: 1 } } }');
		expect(kf).toContain('from { o: 1 }');
		expect(kf).not.toContain(':where(html[data-a11y-solid]) from');
	});

	it('covers every Reduce Transparency and Increase Contrast block in earnest-ui.css', async () => {
		const src = readFileSync(path.resolve(__dirname, '../../core/app/assets/css/earnest-ui.css'), 'utf8');
		const blocks = (
			src.match(/@media[^{]*(?:prefers-reduced-transparency: reduce|prefers-contrast: more)[^{]*\{/g) ?? []
		).length;
		const out = await run(src);
		const gatedRules = out.match(/^[^\n{}]*data-a11y-solid[^\n{}]*\{/gm) ?? [];
		expect(blocks).toBeGreaterThan(0);
		expect(gatedRules.length).toBeGreaterThanOrEqual(blocks);
	});
});
