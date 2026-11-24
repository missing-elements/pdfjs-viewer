import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'

// A bundler emits the viewer's runtime files under hashed names and leaves the PDF.js data behind:
// PDF.js asks for those files by name from a folder URL, so nothing references them one by one.
// The element looks for the data next to two of the runtime files (`RESOURCE_OPTIONS` in
// src/pdfjs-viewer-element.ts). This plugin finds those two files in the build output and writes
// the data next to them, under the names PDF.js expects.
const distDirectory = fileURLToPath(new URL('../dist', import.meta.url))

const dataByAnchor = {
  'viewer.mjs': ['cmaps', 'iccs', 'images', 'standard_fonts', 'wasm'],
  'pdf.mjs': ['pdf.sandbox.mjs']
}

const readFile = (file) => readFileSync(join(distDirectory, file))

const listFiles = (entry) => {
  const path = join(distDirectory, entry)
  if (!statSync(path).isDirectory()) return [entry]
  return readdirSync(path).map((name) => posix.join(entry, name))
}

// The bundler copies a runtime file byte for byte and only renames it, so an emitted asset is
// recognised by its content. That follows any `assetFileNames` setting, and it works in Vite and
// Rollup versions that don't record which source file an asset came from.
const isSameFile = (source, file) =>
  Buffer.byteLength(source) === file.length && file.equals(Buffer.from(source))

export const pdfjsViewerData = () => ({
  name: 'pdfjs-viewer-data',
  generateBundle(_options, bundle) {
    const anchors = Object.entries(dataByAnchor).map(([name, entries]) => ({ file: readFile(name), entries }))

    Object.values(bundle)
      .filter((output) => output.type === 'asset')
      .forEach((asset) => {
        const anchor = anchors.find(({ file }) => isSameFile(asset.source, file))
        if (!anchor) return

        const outputDirectory = posix.dirname(asset.fileName)
        anchor.entries.flatMap(listFiles).forEach((file) => {
          this.emitFile({
            type: 'asset',
            fileName: posix.join(outputDirectory, file),
            source: readFile(file)
          })
        })
      })
  }
})
