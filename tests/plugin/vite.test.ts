import { appendFileSync, copyFileSync, cpSync, createReadStream, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { createRequire } from 'node:module'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { firefox, type Browser } from 'playwright'
import { build, type PluginOption } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pdfjsViewerData } from '../../plugins/vite.js'

const rootDirectory = resolve(import.meta.dirname, '../..')
const distDirectory = join(rootDirectory, 'dist')
const appDirectory = join(rootDirectory, 'tests/fixtures/bundled-app')
const samplePdf = join(rootDirectory, 'tests/fixtures/ccitt-g4.pdf')

const outputDirectories: string[] = []

const listFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(directory, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort()

// Builds the fixture app, which imports the built package the way an installed app does.
const buildApp = async (plugins: PluginOption[], output = {}) => {
  const outDir = mkdtempSync(join(tmpdir(), 'pdfjs-viewer-bundled-app-'))
  outputDirectories.push(outDir)
  await build({
    root: appDirectory,
    configFile: false,
    logLevel: 'error',
    plugins,
    build: { outDir, emptyOutDir: true, rolldownOptions: { output } }
  })
  copyFileSync(samplePdf, join(outDir, 'ccitt-g4.pdf'))
  return outDir
}

const findFile = (files: string[], pattern: RegExp) => {
  const file = files.find((name) => pattern.test(name))
  expect(file, `${pattern} in the build output`).toBeDefined()
  return file!
}

// The folder the plugin moves the runtime files and their data into.
const dataFolder = /pdfjs-viewer-[0-9a-f]{8}/
const getViewerDirectory = (directory: string) => dirname(findFile(listFiles(directory), /\/viewer-[\w-]+\.mjs$/))

const contentTypes: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.pdf': 'application/pdf',
  '.wasm': 'application/wasm'
}

// A dev or preview server answers a missing file with the app's HTML page and a 200. A static host
// answers 404, which is what breaks the viewer in production, so the build output is served that way.
const serve = (directory: string) => new Promise<Server>((done) => {
  const server = createServer((request, response) => {
    const { pathname } = new URL(request.url ?? '/', 'http://localhost')
    const file = join(directory, pathname === '/' ? 'index.html' : decodeURIComponent(pathname))
    if (!file.startsWith(directory) || !statSync(file, { throwIfNoEntry: false })?.isFile()) {
      response.writeHead(404).end()
      return
    }
    response.writeHead(200, { 'content-type': contentTypes[extname(file)] ?? 'application/octet-stream' })
    createReadStream(file).pipe(response)
  })
  server.listen(0, '127.0.0.1', () => done(server))
})

describe('Vite plugin', () => {
  let browser: Browser
  let plainOutput: string
  let pluginOutput: string

  beforeAll(async () => {
    browser = await firefox.launch()
    plainOutput = await buildApp([])
    pluginOutput = await buildApp([pdfjsViewerData()])
  })

  afterAll(async () => {
    await browser?.close()
    outputDirectories.forEach((directory) => rmSync(directory, { recursive: true, force: true }))
  })

  // Opens the built app and reads the first page: the sample PDF fills it with an image that is
  // black on the left and white on the right, which PDF.js decodes with `wasm/jbig2.wasm`.
  const openApp = async (directory: string) => {
    const server = await serve(directory)
    const page = await browser.newPage()
    const missing: string[] = []
    page.on('response', (response) => {
      if (response.status() === 404) missing.push(new URL(response.url()).pathname)
    })

    try {
      await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`)
      // PDF.js finishes the page with or without the image: a failed image is only a warning.
      await page.waitForFunction(() => {
        const viewer = document.querySelector('pdfjs-viewer-element') as any
        return viewer?.iframe?.contentWindow?.PDFViewerApplication?.pdfViewer?.getPageView(0)?.renderingState === 3
      })
      const colors = await page.evaluate(() => {
        const viewer = document.querySelector('pdfjs-viewer-element') as any
        const canvas = viewer.iframe.contentDocument.querySelector('.page canvas') as HTMLCanvasElement
        const readRed = (x: number) =>
          canvas.getContext('2d')!.getImageData(Math.floor(canvas.width * x), Math.floor(canvas.height / 2), 1, 1).data[0]
        return { left: readRed(0.25), right: readRed(0.75) }
      })
      return { ...colors, missing }
    } finally {
      await page.close()
      // The browser keeps its connections open, and `close` alone waits for them to end.
      server.closeAllConnections()
      await new Promise((done) => server.close(done))
    }
  }

  it('leaves a scanned image blank in a build without the plugin', async () => {
    const files = listFiles(plainOutput)
    expect(files.filter((file) => file.includes('wasm/'))).toEqual([])

    const { left, right, missing } = await openApp(plainOutput)
    expect(missing).toContain('/assets/wasm/jbig2.wasm')
    expect(left, 'the black half stays blank').toBeGreaterThan(192)
    expect(right).toBeGreaterThan(192)
  })

  it('draws the scanned image in a build with the plugin', async () => {
    const { left, right, missing } = await openApp(pluginOutput)
    expect(missing.filter((path) => path.startsWith('/assets/'))).toEqual([])
    expect(left, 'the black half').toBeLessThan(64)
    expect(right, 'the white half').toBeGreaterThan(192)
  })

  it('emits every data file under its own name next to the runtime file the element resolves it from', () => {
    const files = listFiles(pluginOutput)
    const viewerDirectory = dirname(findFile(files, /\/viewer-[\w-]+\.mjs$/))
    const libDirectory = dirname(findFile(files, /\/pdf-[\w-]+\.mjs$/))
    // Both runtime files move into one folder inside the app's `assets`.
    expect(viewerDirectory).toMatch(new RegExp(`^assets/${dataFolder.source}$`))
    expect(libDirectory).eq(viewerDirectory)

    // Every folder in `dist` holds data the element resolves against viewer.mjs, so a folder that
    // scripts/copy-worker.mjs starts to ship has to reach the plugin's list too.
    const dataFiles = listFiles(distDirectory).filter((file) => file.includes('/'))
    expect(dataFiles.length).toBeGreaterThan(200)
    const expected = [
      ...dataFiles.map((file) => [`${viewerDirectory}/${file}`, file]),
      [`${libDirectory}/pdf.sandbox.mjs`, 'pdf.sandbox.mjs']
    ]
    for (const [emitted, source] of expected) {
      expect(files, source).toContain(emitted)
      const sameBytes = readFileSync(join(pluginOutput, emitted)).equals(readFileSync(join(distDirectory, source)))
      expect(sameBytes, `${source} is copied byte for byte`).eq(true)
    }
    expect(files.length).eq(listFiles(plainOutput).length + expected.length)
  })

  it('follows the runtime files when the app renames and moves them', async () => {
    const assetFileNames = ({ names }: { names: string[] }) => {
      if (names.includes('viewer.mjs')) return 'static/viewer/v.[hash][extname]'
      if (names.includes('pdf.mjs')) return 'static/lib/p.[hash][extname]'
      return 'static/[name]-[hash][extname]'
    }
    const files = listFiles(await buildApp([pdfjsViewerData()], { assetFileNames }))

    // Each file keeps the directory and the name the app gives it, inside the data folder.
    const viewerDirectory = dirname(findFile(files, new RegExp(`^static/viewer/${dataFolder.source}/v\\.[\\w-]+\\.mjs$`)))
    const libDirectory = dirname(findFile(files, new RegExp(`^static/lib/${dataFolder.source}/p\\.[\\w-]+\\.mjs$`)))
    expect(files).toContain(`${viewerDirectory}/cmaps/Adobe-Japan1-UCS2.bcmap`)
    expect(files.filter((file) => file.endsWith('jbig2.wasm'))).toEqual([`${viewerDirectory}/wasm/jbig2.wasm`])
    expect(files.filter((file) => file.endsWith('pdf.sandbox.mjs'))).toEqual([`${libDirectory}/pdf.sandbox.mjs`])
  })

  it('names the data folder after its content, so an upgrade that changes a data file changes its URLs', async () => {
    // A copy of the package: its plugin reads the copy's `dist`, as an installed plugin reads its own.
    const buildWithPackageCopy = async (changedFile?: string) => {
      const packageDirectory = mkdtempSync(join(tmpdir(), 'pdfjs-viewer-package-'))
      outputDirectories.push(packageDirectory)
      cpSync(join(rootDirectory, 'plugins'), join(packageDirectory, 'plugins'), { recursive: true })
      cpSync(distDirectory, join(packageDirectory, 'dist'), { recursive: true })
      if (changedFile) appendFileSync(join(packageDirectory, 'dist', changedFile), '\0')
      const plugin = await import(/* @vite-ignore */ pathToFileURL(join(packageDirectory, 'plugins/vite.js')).href)
      return getViewerDirectory(await buildApp([plugin.pdfjsViewerData()]))
    }

    const folder = getViewerDirectory(pluginOutput)
    expect(await buildWithPackageCopy(), 'the same files keep their folder').eq(folder)
    expect(await buildWithPackageCopy('wasm/openjpeg.wasm'), 'a changed decoder moves to a new folder').not.eq(folder)
  })

  it('is exported from the package as ./vite, with types', () => {
    const packageJson = JSON.parse(readFileSync(join(rootDirectory, 'package.json'), 'utf8'))
    const require = createRequire(import.meta.url)
    expect(require.resolve(`${packageJson.name}/vite`)).eq(join(rootDirectory, 'plugins/vite.js'))
    expect(statSync(join(rootDirectory, packageJson.exports['./vite'].types)).isFile()).eq(true)
  })
})
