// Solid surfaces — HOA Connect's own Reduce Transparency / Increase Contrast.
//
// iOS does not tell a page about either setting (Earnest, on an iPhone,
// 2026-11-27; HOA Connect's `public/media-probe.html` checks the same here), so
// every `@media (prefers-reduced-transparency: reduce)` and
// `@media (prefers-contrast: more)` rule is dead there. The switch sets
// `data-a11y-solid` on <html>, and core/build/postcss-solid-surfaces.ts copies
// each of those rules behind the attribute at build time, so turning it on
// gives what the system settings would: no blur, opaque surfaces, drawn edges.
//
// Shared by the composable (useSolidSurfaces) and the global head script in
// core/nuxt.config.ts, which stamps the attribute before first paint on every
// page — the public site included — so there is no translucent flash.

/** This device's choice. Per device, not per account: it answers the device's own settings. */
export const SOLID_SURFACES_KEY = "app-solid-surfaces";
export const SOLID_SURFACES_ATTR = "data-a11y-solid";

/** Inlined into <head>; tiny and dependency-free. */
export const SOLID_SURFACES_PREPAINT_SCRIPT = `(function(){try{if(localStorage.getItem('${SOLID_SURFACES_KEY}')==='on')document.documentElement.setAttribute('${SOLID_SURFACES_ATTR}','');}catch(e){}})();`;
