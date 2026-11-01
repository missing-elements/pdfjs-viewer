/// <reference types="vitest" />
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import terser from '@rollup/plugin-terser'
import { playwright } from '@vitest/browser-playwright'
import { minify as minifyHtml } from 'html-minifier-terser'
import { bundleCss } from './scripts/bundle-css.mjs'

const VIEWER_HTML_VIRTUAL_ID = 'virtual:pdfjs-viewer-html'

// The element's default stylesheets, as JS modules that export the bundled CSS text. Consumer
// bundlers process any `.css` file the element references as the app's own CSS.
const STYLESHEET_VIRTUAL_IDS: Record<string, string> = {
  'virtual:pdfjs-viewer-css': 'src/web/viewer.css',
  'virtual:pdfjs-viewer-theme-css': 'src/themes/paper-and-ink.css'
}

const stylesheetModules = () => ({
  name: 'stylesheet-modules',
  resolveId(id: string) {
    return id in STYLESHEET_VIRTUAL_IDS ? `\0${id}` : null
  },
  async load(id: string) {
    const sourcePath = id.startsWith('\0') ? STYLESHEET_VIRTUAL_IDS[id.slice(1)] : undefined
    if (!sourcePath) {
      return null
    }

    const css = await bundleCss(resolve(process.cwd(), sourcePath))
    return `export default ${JSON.stringify(css)};`
  }
})
const RESOLVED_VIEWER_HTML_VIRTUAL_ID = '\0virtual:pdfjs-viewer-html'

const rawViewerHtmlMinifier = () => ({
  name: 'raw-viewer-html-minifier',
  resolveId(id: string) {
    if (id === VIEWER_HTML_VIRTUAL_ID) {
      return RESOLVED_VIEWER_HTML_VIRTUAL_ID
    }

    return null
  },
  async load(id: string) {
    if (id !== RESOLVED_VIEWER_HTML_VIRTUAL_ID) {
      return null
    }

    const sourcePath = resolve(process.cwd(), 'src', 'web', 'viewer.html')
    const sourceHtml = await readFile(sourcePath, 'utf8')
    const minifiedHtml = await minifyHtml(sourceHtml, {
      collapseWhitespace: true,
      conservativeCollapse: true,
      removeComments: false,
      keepClosingSlash: true,
      removeRedundantAttributes: true,
      sortAttributes: false,
      sortClassName: false,
      caseSensitive: true
    })

    return `export default ${JSON.stringify(minifiedHtml)};`
  }
})

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [rawViewerHtmlMinifier(), stylesheetModules()],
  build: {
    minify: 'terser',
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo: { name?: string }) => {
          if (assetInfo.name?.endsWith('.css')) {
            return '[name][extname]'
          }

          return '[name]-[hash][extname]'
        },
        plugins: [
          terser({
            compress: true,
            mangle: false,
            format: { comments: false }
          })
        ]
      }
    },
    lib: {
      name: 'PdfjsViewerElement',
      fileName: 'pdfjs-viewer-element',
      entry: 'src/pdfjs-viewer-element.ts',
      formats: ['es']
    },
    copyPublicDir: false
  },
  test: {
    browser: {
      // Vitest provider overloads can conflict when multiple provider typings exist in the graph.
      provider: playwright(),
      enabled: true,
      // at least one instance is required
      instances: [
        { browser: 'firefox' }
      ]
    }
  },
  optimizeDeps: {
    // Prevent resolve external deps of the prebuild from v.4.0.189 
    exclude: ['canvas', 'path2d-polyfill', 'path2d']
  }
})
