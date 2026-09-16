import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build, transform } from 'esbuild'

const rootDir = resolve(import.meta.dirname, '..')
const sourceFile = resolve(rootDir, 'src', 'build', 'pdf.worker.min.mjs')
const sourcePdfFile = resolve(rootDir, 'src', 'build', 'pdf.min.mjs')
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

// Bundles a stylesheet so that its url(...) references are inlined as data URLs. Consumer
// bundlers emit dist files under hashed, relocated names, and viewer.css alone would otherwise
// break: it references images/ relative to its own URL. esbuild picks base64 or percent
// encoding per file, whichever is shorter.
const bundleCssFile = async (sourcePath, targetPath) => {
	await build({
		entryPoints: [sourcePath],
		outfile: targetPath,
		bundle: true,
		minify: true,
		legalComments: 'none',
		loader: {
			'.svg': 'dataurl',
			'.gif': 'dataurl'
		}
	})
}

await Promise.all([
	copyFile(sourceFile, targetFile),
	copyFile(sourcePdfFile, targetPdfFile),
	minifyModuleFile(sourceViewerFile, targetViewerFile),
	bundleCssFile(sourceViewerCssFile, targetViewerCssFile),
	bundleCssFile(sourcePaperAndInkCssFile, targetPaperAndInkCssFile),
	cp(sourceViewerImagesDir, targetViewerImagesDir, { recursive: true, force: true })
])
