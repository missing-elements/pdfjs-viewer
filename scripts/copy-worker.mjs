import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { transform } from 'esbuild'
import { bundleCss } from './bundle-css.mjs'

const rootDir = resolve(import.meta.dirname, '..')
const sourceFile = resolve(rootDir, 'src', 'build', 'pdf.worker.min.mjs')
const sourcePdfFile = resolve(rootDir, 'src', 'build', 'pdf.min.mjs')
const sourceViewerFile = resolve(rootDir, 'src', 'web', 'viewer.mjs')
const sourceViewerCssFile = resolve(rootDir, 'src', 'web', 'viewer.css')
const sourceViewerImagesDir = resolve(rootDir, 'src', 'web', 'images')
const sourcePaperAndInkCssFile = resolve(rootDir, 'src', 'themes', 'paper-and-ink.css')
const sourceSandboxFile = resolve(rootDir, 'src', 'build', 'pdf.sandbox.min.mjs')
const distDir = resolve(rootDir, 'dist')
const targetFile = resolve(distDir, 'pdf.worker.min.mjs')
const targetSandboxFile = resolve(distDir, 'pdf.sandbox.mjs')
// Resources PDF.js loads only for documents that need them. The element defaults their URLs to
// these folders next to viewer.mjs.
const resourceDirs = ['cmaps', 'iccs', 'standard_fonts', 'wasm']
const targetPdfFile = resolve(distDir, 'pdf.mjs')
const targetViewerFile = resolve(distDir, 'viewer.mjs')
const targetViewerCssFile = resolve(distDir, 'viewer.css')
const targetViewerImagesDir = resolve(distDir, 'images')
const targetPaperAndInkCssFile = resolve(distDir, 'paper-and-ink.css')

await mkdir(distDir, { recursive: true })

const copyFile = async (sourcePath, targetPath) => {
	const code = await readFile(sourcePath, 'utf8')
	await writeFile(targetPath, code, 'utf8')
}

const minifyModuleFile = async (sourcePath, targetPath) => {
	const code = await readFile(sourcePath, 'utf8')
	const result = await transform(code, {
		loader: 'js',
		format: 'esm',
		target: 'es2022',
		minify: true,
		legalComments: 'none'
	})

	await writeFile(targetPath, result.code, 'utf8')
}

// The element applies the same text from JS modules (see vite.config.ts); these files are for
// `assets-base`, `viewer-css-src` and `theme-css-src`.
const bundleCssFile = async (sourcePath, targetPath) => {
	await writeFile(targetPath, await bundleCss(sourcePath), 'utf8')
}

await Promise.all([
	copyFile(sourceFile, targetFile),
	copyFile(sourcePdfFile, targetPdfFile),
	minifyModuleFile(sourceViewerFile, targetViewerFile),
	bundleCssFile(sourceViewerCssFile, targetViewerCssFile),
	bundleCssFile(sourcePaperAndInkCssFile, targetPaperAndInkCssFile),
	cp(sourceViewerImagesDir, targetViewerImagesDir, { recursive: true, force: true }),
	copyFile(sourceSandboxFile, targetSandboxFile),
	...resourceDirs.map((dirName) =>
		cp(resolve(rootDir, 'src', 'web', dirName), resolve(distDir, dirName), { recursive: true, force: true })
	)
])
