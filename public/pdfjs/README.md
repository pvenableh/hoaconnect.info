# pdf.js decoders

`wasm/` holds the decoders pdf.js loads when a scanned PDF uses JPEG 2000 (`openjpeg.wasm`), JBIG2
(`jbig2.wasm`) or an ICC colour profile (`qcms_bg.wasm`). Without them pdf.js draws such a page blank and says nothing.

Copied unchanged from `pdfjs-dist@5.6.205/wasm` (Apache-2.0; each decoder's licence file sits beside it), the version
`unpdf@1.6.2` bundles. Used by `core/app/composables/useGoverningPageRender.ts` as `wasmUrl`. When `unpdf` moves to a
new pdf.js, copy the matching `wasm/` folder again.
