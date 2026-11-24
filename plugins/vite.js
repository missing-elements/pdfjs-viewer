import { createHash } from 'node:crypto'
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
  return readdirSync(path).map((name) => posix.join(entry, name)).sort()
}

let anchors
const getAnchors = () => {
  anchors ??= Object.entries(dataByAnchor).map(([name, entries]) => ({
    file: readFile(name),
    dataFiles: entries.flatMap(listFiles)
  }))
  return anchors
}

// The data keeps the names PDF.js asks for, so on its own its URLs would stay the same across
// upgrades, and a host that caches the build's assets as `immutable` would keep serving an older
// PDF.js version's files to returning visitors. The runtime files and their data go into a folder
// named after a hash of all of them instead: an upgrade that changes any of them changes every URL
// in it, and one that changes none keeps them.
let folderName
const getFolderName = () => {
  if (!folderName) {
    const hash = createHash('sha256')
    getAnchors().forEach(({ file, dataFiles }) => {
      hash.update(file)
      dataFiles.forEach((name) => hash.update(`\0${name}\0`).update(readFile(name)))
    })
    folderName = `pdfjs-viewer-${hash.digest('hex').slice(0, 8)}`
  }
  return folderName
}

// The bundler copies a runtime file byte for byte and only renames it, so an emitted asset is
// recognised by its content. That follows any `assetFileNames` setting, and it works in Vite and
// Rollup versions that don't record which source file an asset came from.
const isSameFile = (source, file) =>
  source != null && Buffer.byteLength(source) === file.length && file.equals(Buffer.from(source))

const findAnchor = (source) => getAnchors().find(({ file }) => isSameFile(source, file))

export const pdfjsViewerData = () => ({
  name: 'pdfjs-viewer-data',
  // Keeps the app's own `assetFileNames` and adds the folder in front of the file name, so a
  // runtime file stays in the directory the app gives it.
  outputOptions(options) {
    const assetFileNames = options.assetFileNames ?? 'assets/[name]-[hash][extname]'
    return {
      ...options,
      assetFileNames: (asset) => {
        const pattern = typeof assetFileNames === 'function' ? assetFileNames(asset) : assetFileNames
        if (!findAnchor(asset.source)) return pattern
        return posix.join(posix.dirname(pattern), getFolderName(), posix.basename(pattern))
      }
    }
  },
  generateBundle(_options, bundle) {
    Object.values(bundle)
      .filter((output) => output.type === 'asset')
      .forEach((asset) => {
        const anchor = findAnchor(asset.source)
        if (!anchor) return

        const outputDirectory = posix.dirname(asset.fileName)
        anchor.dataFiles.forEach((file) => {
          this.emitFile({
            type: 'asset',
            fileName: posix.join(outputDirectory, file),
            source: readFile(file)
          })
        })
      })
  }
})
