# pdfjs-viewer

View and edit PDF files using restyled Firefox's built-in viewer. It runs in an isolated iframe and has no runtime dependencies, works everywhere.

[![npm version](https://img.shields.io/npm/v/@missing-elements/pdfjs-viewer?logo=npm&logoColor=fff)](https://www.npmjs.com/package/@missing-elements/pdfjs-viewer)
[![jsDelivr hits](https://data.jsdelivr.com/v1/package/npm/@missing-elements/pdfjs-viewer/badge)](https://www.jsdelivr.com/package/npm/@missing-elements/pdfjs-viewer)

**[Documentation and live playground](https://missing-elements.github.io/pdfjs-viewer/)**

![The PDF.js viewer with its toolbar, showing a document page inside a web page](image.webp)

## Why use it

- **Instead of the browser's built-in viewer:** you get the same viewer and editor in every browser, and your code controls it. Set the page, zoom, search, theme and language with attributes, or use PDF.js's own API.
- **Instead of wiring up `pdfjs-dist` yourself:** PDF.js, its viewer interface, its worker and the data some PDFs need (CMaps, fonts, image decoders, the scripting sandbox) ship in the package, and nothing loads from a CDN by default.
- **What it costs:** the element is 4 KB gzipped. The viewer files, about 720 KB gzipped, load only when a viewer is on the page, and the extra PDF.js data only for documents that need it.
- **When to use something else:** if you want your own page-rendering interface rather than the PDF.js viewer, use [`pdfjs-dist`](https://www.npmjs.com/package/pdfjs-dist) directly.

## Install

```bash
npm install @missing-elements/pdfjs-viewer
```

```js
import '@missing-elements/pdfjs-viewer'
```

Vite, webpack 5 and Next.js bundle the viewer with no configuration. They don't copy the PDF.js data folders, though, because PDF.js loads those files by name. Without them, scanned pages compressed with JBIG2, CCITT or JPEG 2000 render blank or black, CJK text in fonts the PDF doesn't embed goes missing, and JavaScript in PDFs doesn't run. To support every PDF, copy the package's `dist` folder into your public files, for example in a `postinstall` script, and point [`assets-base`](https://missing-elements.github.io/pdfjs-viewer/#hosting) at it:

```html
<pdfjs-viewer-element src="/file.pdf" assets-base="/pdfjs-viewer/"></pdfjs-viewer-element>
```

Or load it from a CDN without a build step:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@missing-elements/pdfjs-viewer@4/dist/pdfjs-viewer-element.js"></script>
```

## Usage

```html
<pdfjs-viewer-element
  src="/file.pdf"
  page="2"
  zoom="page-width"
  style="height: 100dvh">
</pdfjs-viewer-element>
```

The element needs an explicit height. Most attributes apply as soon as they change.

## Documentation

- [Quick start](https://missing-elements.github.io/pdfjs-viewer/#quick-start)
- [Attributes and playground](https://missing-elements.github.io/pdfjs-viewer/#attributes)
- [Methods and properties](https://missing-elements.github.io/pdfjs-viewer/#methods-and-properties): `initPromise`, `setViewerOptions`, `injectViewerStyles`, `iframe`
- [Theming](https://missing-elements.github.io/pdfjs-viewer/#theming) and [localization](https://missing-elements.github.io/pdfjs-viewer/#localization)
- [Hosting](https://missing-elements.github.io/pdfjs-viewer/#hosting): bundlers, `assets-base`, CDN, worker, CSP
- [React, Vue and Svelte](https://missing-elements.github.io/pdfjs-viewer/#frameworks)
- [Migrating from `pdfjs-viewer-element`](https://missing-elements.github.io/pdfjs-viewer/#migrating-from-pdfjs-viewer-element), the deprecated former package name
- [Demo pages](./demo) and the [accessibility guide](./ACCESSIBILITY.md)

## Status

Actively maintained. The package bundles PDF.js 6.4.299 and follows PDF.js releases.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Report security issues as described in [SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE)
