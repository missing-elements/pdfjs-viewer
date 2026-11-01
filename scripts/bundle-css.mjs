import { build } from 'esbuild'

// Bundles a stylesheet so that its url(...) references are inlined as data URLs. Consumer
// bundlers emit dist files under hashed, relocated names, and viewer.css alone would otherwise
// break: it references images/ relative to its own URL. esbuild picks base64 or percent
// encoding per file, whichever is shorter.
export const bundleCss = async (sourcePath) => {
	const result = await build({
		entryPoints: [sourcePath],
		bundle: true,
		minify: true,
		legalComments: 'none',
		write: false,
		loader: {
			'.svg': 'dataurl',
			'.gif': 'dataurl'
		}
	})

	return result.outputFiles[0].text
}
