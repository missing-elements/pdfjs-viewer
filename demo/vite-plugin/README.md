# Vite plugin demo

A minimal Vite app with `<pdfjs-viewer-element>` and the package's Vite plugin. Its PDF holds one scanned image compressed with CCITT. PDF.js decodes that with `wasm/jbig2.wasm`, one of the data files the plugin copies into the build.

```bash
npm install
npm run build
npm run preview
```

Open the address `vite preview` prints. The left half of the page is black.

To see the problem the plugin solves, remove `pdfjsViewerData()` from [vite.config.js](vite.config.js) and build again. The page stays white, and the console says `Unable to decode image "img_p0_1": "Jbig2Error: JBig2 failed to initialize"`. The build has no `assets/wasm/` folder: `vite preview` answers those requests with the app's HTML page, and a static host answers 404.

`npm run dev` shows the image with or without the plugin, because the dev server serves the package's own files. That is why the problem only appears after a build.

The demo installs the published package, version 4.6.0 or later.
