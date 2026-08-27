/// <reference types="vitest" />
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import terser from '@rollup/plugin-terser'
import { webdriverio } from '@vitest/browser-webdriverio'
import { minify as minifyHtml } from 'html-minifier-terser'

const VIEWER_HTML_VIRTUAL_ID = 'virtual:pdfjs-viewer-html'
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
  plugins: [rawViewerHtmlMinifier()],
  build: {
    minify: 'terser',
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
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
      provider: webdriverio(),
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
