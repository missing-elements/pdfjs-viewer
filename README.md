# pdfjs-viewer

The [PDF.js default viewer](https://mozilla.github.io/pdf.js/web/viewer.html) as one self-hosted HTML element, `<pdfjs-viewer-element>`. It runs in an isolated iframe and has no runtime dependencies.

[![npm version](https://img.shields.io/npm/v/@missing-elements/pdfjs-viewer?logo=npm&logoColor=fff)](https://www.npmjs.com/package/@missing-elements/pdfjs-viewer)
[![jsDelivr hits](https://data.jsdelivr.com/v1/package/npm/@missing-elements/pdfjs-viewer/badge)](https://www.jsdelivr.com/package/npm/@missing-elements/pdfjs-viewer)

**[Documentation and live playground](https://missing-elements.github.io/pdfjs-viewer/)**

![The PDF.js viewer with its toolbar, showing a document page inside a web page](image.webp)

## Why use it

- **Instead of the browser's built-in viewer:** you get the same viewer in every browser, and your code controls it. Set the page, zoom, search, theme and language with attributes, or use PDF.js's own API.
- **Instead of wiring up `pdfjs-dist` yourself:** PDF.js, its viewer interface and its worker ship in the package. Vite and webpack 5 need no configuration, and nothing loads from a CDN by default.
- **What it costs:** the element is 4 KB gzipped. The viewer files, about 720 KB gzipped, load only when a viewer is on the page.
- **When to use something else:** if you want your own page-rendering interface rather than the PDF.js viewer, use [`pdfjs-dist`](https://www.npmjs.com/package/pdfjs-dist) directly.

## Install

```bash
npm install @missing-elements/pdfjs-viewer
```

```js
import '@missing-elements/pdfjs-viewer'
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
