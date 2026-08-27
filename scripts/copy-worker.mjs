import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { minify } from 'terser'

const rootDir = resolve(import.meta.dirname, '..')
const sourceFile = resolve(rootDir, 'src', 'build', 'pdf.worker.mjs')
const sourcePdfFile = resolve(rootDir, 'src', 'build', 'pdf.mjs')
const sourceViewerFile = resolve(rootDir, 'src', 'web', 'viewer.mjs')
const sourceViewerCssFile = resolve(rootDir, 'src', 'web', 'viewer.css')
const sourceViewerImagesDir = resolve(rootDir, 'src', 'web', 'images')
const sourcePaperAndInkCssFile = resolve(rootDir, 'src', 'themes', 'paper-and-ink.css')
const distDir = resolve(rootDir, 'dist')
const targetFile = resolve(distDir, 'pdf.worker.min.mjs')
const targetPdfFile = resolve(distDir, 'pdf.mjs')
const targetViewerFile = resolve(distDir, 'viewer.mjs')
const targetViewerCssFile = resolve(distDir, 'viewer.css')
const targetViewerImagesDir = resolve(distDir, 'images')
const targetPaperAndInkCssFile = resolve(distDir, 'paper-and-ink.css')

await mkdir(distDir, { recursive: true })

const MINIFY_OPTIONS = {
	module: true,
	compress: true,
	mangle: true,
	format: {
		comments: false
	}
}

const minifyFile = async (sourcePath, targetPath, label) => {
	const code = await readFile(sourcePath, 'utf8')
	const result = await minify(code, MINIFY_OPTIONS)

	if (!result.code) {
		throw new Error(`${label} minification failed: empty output`)
	}

	await writeFile(targetPath, result.code, 'utf8')
}

const copyFile = async (sourcePath, targetPath) => {
	const code = await readFile(sourcePath, 'utf8')
	await writeFile(targetPath, code, 'utf8')
}

await Promise.all([
	minifyFile(sourceFile, targetFile, 'Worker'),
	minifyFile(sourcePdfFile, targetPdfFile, 'PDF runtime'),
	minifyFile(sourceViewerFile, targetViewerFile, 'Viewer runtime'),
	copyFile(sourceViewerCssFile, targetViewerCssFile),
	copyFile(sourcePaperAndInkCssFile, targetPaperAndInkCssFile),
	cp(sourceViewerImagesDir, targetViewerImagesDir, { recursive: true, force: true })
])
