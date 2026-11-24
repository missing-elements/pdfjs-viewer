/**
 * A Vite plugin. It writes the PDF.js data the viewer loads on demand (`wasm/`, `cmaps/`,
 * `standard_fonts/`, `iccs/`, `images/` and `pdf.sandbox.mjs`) into the build output, next to the
 * viewer files Vite emits. The element finds the data there, with no `assets-base` or resource
 * attribute.
 */
export declare function pdfjsViewerData(): { name: string }
