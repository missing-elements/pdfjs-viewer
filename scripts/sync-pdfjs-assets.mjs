import { cp, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { unzipSync } from 'fflate'

const rootDir = resolve(import.meta.dirname, '..')

const fail = (message) => {
  console.error(`\n[sync-pdfjs] ${message}`)
  process.exit(1)
}

const exists = async (path) => {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

const extractVersion = (versionSpec) => versionSpec?.match(/\d+\.\d+\.\d+/)?.[0]

const packageJson = JSON.parse(await readFile(resolve(rootDir, 'package.json'), 'utf8'))
const pdfjsDistSpec =
  packageJson.dependencies?.['pdfjs-dist'] || packageJson.devDependencies?.['pdfjs-dist']

if (!pdfjsDistSpec) {
  fail('Missing pdfjs-dist dependency in package.json')
}

const pdfjsVersion = extractVersion(pdfjsDistSpec)
if (!pdfjsVersion) {
  fail(`Could not parse pdfjs-dist version from "${pdfjsDistSpec}"`)
}

const pdfjsDistDir = resolve(rootDir, 'node_modules', 'pdfjs-dist')
const releaseDir = resolve(rootDir, 'public', `pdfjs-${pdfjsVersion}-dist`)
const releaseWebDir = resolve(releaseDir, 'web')
const modernBuildDir = resolve(pdfjsDistDir, 'build')
const legacyBuildDir = resolve(pdfjsDistDir, 'legacy', 'build')

if (!(await exists(pdfjsDistDir))) {
  fail('node_modules/pdfjs-dist not found. Run "pnpm install" first.')
}

const downloadRelease = async () => {
  const archiveName = `pdfjs-${pdfjsVersion}-dist.zip`
  const url = `https://github.com/mozilla/pdf.js/releases/download/v${pdfjsVersion}/${archiveName}`
  console.log(`[sync-pdfjs] Downloading ${url}`)

  let response
  try {
    response = await fetch(url)
  } catch (error) {
    fail(`Could not download ${archiveName}: ${error.message}`)
  }
  if (!response.ok) {
    fail(`Could not download ${archiveName}: HTTP ${response.status} ${response.statusText}`)
  }

  const entries = unzipSync(new Uint8Array(await response.arrayBuffer()))
  const tempDir = `${releaseDir}.tmp`
  await rm(tempDir, { recursive: true, force: true })

  for (const [entryName, data] of Object.entries(entries)) {
    if (entryName.endsWith('/')) continue
    const targetPath = resolve(tempDir, entryName)
    if (!targetPath.startsWith(tempDir + sep)) {
      fail(`Refusing to extract entry outside release directory: ${entryName}`)
    }
    await mkdir(dirname(targetPath), { recursive: true })
    await writeFile(targetPath, data)
  }

  await rm(releaseDir, { recursive: true, force: true })
  await rename(tempDir, releaseDir)
}

if (!(await exists(releaseWebDir))) {
  await downloadRelease()
}

if (!(await exists(releaseWebDir))) {
  fail(`Downloaded release is missing viewer files at public/pdfjs-${pdfjsVersion}-dist/web`)
}

if (!(await exists(modernBuildDir))) {
  fail('Missing pdfjs-dist build directory in node_modules/pdfjs-dist/build')
}

const selectedBuildDir = (await exists(legacyBuildDir)) ? legacyBuildDir : modernBuildDir

const srcBuildDir = resolve(rootDir, 'src', 'build')
const srcWebDir = resolve(rootDir, 'src', 'web')

const recreateDir = async (path) => {
  await rm(path, { recursive: true, force: true })
  await mkdir(path, { recursive: true })
}

const copyRequiredFile = async (sourcePath, targetPath) => {
  if (!(await exists(sourcePath))) {
    fail(`Required source file missing: ${sourcePath}`)
  }
  await cp(sourcePath, targetPath)
}

await recreateDir(srcBuildDir)

for (const fileName of [
  'pdf.mjs',
  'pdf.min.mjs',
  'pdf.mjs.map',
  'pdf.sandbox.mjs',
  'pdf.sandbox.min.mjs',
  'pdf.sandbox.mjs.map',
  'pdf.worker.mjs',
  'pdf.worker.min.mjs',
  'pdf.worker.mjs.map'
]) {
  await copyRequiredFile(
    resolve(selectedBuildDir, fileName),
    resolve(srcBuildDir, fileName)
  )
}

const packageWebDirs = {
  cmaps: resolve(pdfjsDistDir, 'cmaps'),
  iccs: resolve(pdfjsDistDir, 'iccs'),
  images: resolve(pdfjsDistDir, 'web', 'images'),
  standard_fonts: resolve(pdfjsDistDir, 'standard_fonts'),
  wasm: resolve(pdfjsDistDir, 'wasm')
}

for (const [dirName, sourceDir] of Object.entries(packageWebDirs)) {
  const targetDir = resolve(srcWebDir, dirName)
  await recreateDir(targetDir)
  await cp(sourceDir, targetDir, { recursive: true, force: true })
}

const releaseViewerFiles = [
  'viewer.css',
  'viewer.html',
  'viewer.mjs',
  'viewer.mjs.map',
  'debugger.css',
  'debugger.mjs',
  'compressed.tracemonkey-pldi-09.pdf'
]

for (const fileName of releaseViewerFiles) {
  await copyRequiredFile(
    resolve(releaseWebDir, fileName),
    resolve(srcWebDir, fileName)
  )
}

const viewerHtmlPath = resolve(srcWebDir, 'viewer.html')
const viewerHtml = await readFile(viewerHtmlPath, 'utf8')
const productionSnippetPattern =
  /<!-- This snippet is used in production \(included from viewer\.html\) -->\n<link rel="resource" type="application\/l10n" href="locale\/locale\.json" \/>\n<script src="\.\.\/build\/pdf\.mjs" type="module"><\/script>\n\n\s*<link rel="stylesheet" href="viewer\.css" \/>\n\n\s*<script src="viewer\.mjs" type="module"><\/script>\n/m
const sanitizedViewerHtml = viewerHtml.replace(productionSnippetPattern, '')
if (sanitizedViewerHtml !== viewerHtml) {
  await writeFile(viewerHtmlPath, sanitizedViewerHtml, 'utf8')
}

const localeTargetDir = resolve(srcWebDir, 'locale')
await recreateDir(localeTargetDir)
await cp(resolve(releaseWebDir, 'locale'), localeTargetDir, {
  recursive: true,
  force: true
})

const buildFlavor = selectedBuildDir === legacyBuildDir ? 'legacy' : 'modern'
console.log(`[sync-pdfjs] Synced PDF.js assets for v${pdfjsVersion} (${buildFlavor} build)`)
