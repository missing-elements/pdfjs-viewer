import { describe, expect, it, vi } from 'vitest'
import { getFileData, getViewerElement, mountViewer, mountViewerWithPageCsp, getIframe } from './utils'
import { PdfjsViewerElement } from '../src/pdfjs-viewer-element'
import packageJson from '../package.json'

// The PDF.js release that `pnpm sync:pdfjs` unpacks into `public/`.
const pdfjsDist = `/pdfjs-${packageJson.dependencies['pdfjs-dist'].match(/\d+\.\d+\.\d+/)![0]}-dist`

// A PDF in the repository, vendored with the viewer. A file put in `public/` by hand is not in the
// repository, so CI doesn't have it.
const samplePdf = '/src/web/compressed.tracemonkey-pldi-09.pdf'

describe('Basic tests', async () => {
  it('should render the PDF file', async () => {
    const viewerApp = await mountViewer(`
      <pdfjs-viewer-element src="${samplePdf}"></pdfjs-viewer-element>`
    ) as unknown as { pagesCount: number }

    // PDF.js marks a page as loaded once it starts drawing the page into its canvas.
    await vi.waitFor(() => expect(getViewerElement('#viewer .page[data-loaded] canvas')).exist, { timeout: 10_000 })
    expect(viewerApp.pagesCount).eq(14)
  })

  it('should not render PDF with wrong url', async () => {
    const viewerApp = await mountViewer('<pdfjs-viewer-element></pdfjs-viewer-element>')
    // Whichever comes first: a failed load, or the pages of a document that loaded.
    const outcome = new Promise<string>((resolve) => {
      viewerApp!.eventBus.on('documenterror', () => resolve('error'))
      viewerApp!.eventBus.on('pagesloaded', () => resolve('pages'))
    })
    document.body.querySelector('pdfjs-viewer-element')!.setAttribute('src', '/fake-file.pdf')

    expect(await outcome).eq('error')
    expect(getViewerElement('#viewer .page')).not.exist
  })

  it('should open the external file with base64 source', async () => {
    const viewerApp = await mountViewer(`
      <pdfjs-viewer-element></pdfjs-viewer-element>`
    )

    await viewerApp!.open({ data: await getFileData() })
    await vi.waitFor(() => expect(getViewerElement('#viewer .textLayer')?.textContent).toContain('Hello, world!'), { timeout: 10_000 })
  })

  it('should load the dark theme', async () => {
    await mountViewer(`
      <pdfjs-viewer-element viewer-css-theme="DARK"></pdfjs-viewer-element>`
    )

    expect(getViewerElement()).exist
    expect(getComputedStyle(getViewerElement()!).getPropertyValue('--body-bg-color')).toMatch('#0d1117')
  })

  it('should keep LIGHT fixed while automatic mode follows the system theme', async () => {
    await mountViewer('<pdfjs-viewer-element viewer-css-theme="LIGHT"></pdfjs-viewer-element>')
    const viewer = document.body.querySelector('pdfjs-viewer-element')!
    const doc = getIframe().contentDocument!
    // The whole theme sits in one block that steps aside in forced colors mode.
    const themeSheet = doc.adoptedStyleSheets.find(sheet =>
      (sheet.cssRules[0] as CSSMediaRule | undefined)?.conditionText === 'not all and (forced-colors: active)'
    )!
    expect(themeSheet.cssRules).toHaveLength(1)
    const themeBlock = themeSheet.cssRules[0] as CSSMediaRule
    expect(themeBlock.conditionText).eq('not all and (forced-colors: active)')
    const darkRules = Array.from(themeBlock.cssRules).filter(
      (rule): rule is CSSMediaRule => (rule as CSSMediaRule).conditionText === '(prefers-color-scheme: dark)'
    )
    // One system dark block per palette; the neutral palette hides the warm one in the colors below.
    expect(darkRules).toHaveLength(2)
    // `--hover-filter` comes from viewer.css, which switches it on the system scheme alone. The
    // bundled stylesheets are minified, and custom properties keep the text as written.
    const colors = () => [
      getComputedStyle(doc.documentElement).getPropertyValue('--body-bg-color').trim(),
      getComputedStyle(doc.querySelector('#viewsManager')!).getPropertyValue('--text-color').trim(),
      getComputedStyle(doc.documentElement).getPropertyValue('--hover-filter').trim()
    ]
    const light = ['#f1f3f5', '#1f2328', 'brightness(.9)']
    const dark = ['#0d1117', '#e6edf3', 'brightness(1.4)']
    for (const systemDark of [false, true, false]) {
      // Toggle matching of the system dark rules without depending on the host's theme.
      darkRules.forEach(rule => { rule.media.mediaText = systemDark ? 'all' : 'not all' })
      viewer.setAttribute('viewer-css-theme', 'LIGHT')
      expect(doc.documentElement.dataset.colorScheme).eq('light')
      expect(colors()).toEqual(light)
      viewer.setAttribute('viewer-css-theme', 'DARK')
      expect(doc.documentElement.dataset.colorScheme).eq('dark')
      expect(colors()).toEqual(dark)
      viewer.setAttribute('viewer-css-theme', 'AUTOMATIC')
      expect(doc.documentElement.dataset.colorScheme).toBeUndefined()
      expect(colors()).toEqual(systemDark ? dark : light)
      viewer.removeAttribute('viewer-css-theme')
      expect(colors()).toEqual(systemDark ? dark : light)
    }
  })

  it('should hide the download button', async () => {
    document.body.innerHTML = '<pdfjs-viewer-element></pdfjs-viewer-element>'

    const viewer = document.body.querySelector('pdfjs-viewer-element') as HTMLElement & {
      injectViewerStyles: (styles: string) => Promise<void>
      initPromise: Promise<{ viewerApp?: { initializedPromise: Promise<void> } }>
    }

    await viewer.initPromise
    await viewer.injectViewerStyles('#downloadButton { display: none }')

    expect(getViewerElement()).exist
    expect(getComputedStyle(getViewerElement('#downloadButton')!).display).eq('none')
  })

  it('should apply the bundled stylesheets without referencing CSS files', async () => {
    await mountViewer('<pdfjs-viewer-element></pdfjs-viewer-element>')

    const doc = getIframe().contentDocument!
    expect(doc.querySelector('link[rel="stylesheet"]')).not.exist
    expect(doc.adoptedStyleSheets.length).toBeGreaterThanOrEqual(2)
    expect(doc.body.hidden).toBe(false)
    expect(getComputedStyle(getViewerElement('#viewerContainer')!).position).eq('absolute')
  })

  it('should apply injected styles after the theme', async () => {
    document.body.innerHTML = '<pdfjs-viewer-element viewer-css-theme="DARK"></pdfjs-viewer-element>'
    const viewer = document.body.querySelector('pdfjs-viewer-element') as PdfjsViewerElement
    await viewer.injectViewerStyles(':root, :root[data-color-scheme] { --body-bg-color: rgb(4, 5, 6) }')
    await viewer.initPromise

    const doc = getIframe().contentDocument!
    expect(getComputedStyle(doc.documentElement).getPropertyValue('--body-bg-color').trim()).eq('rgb(4, 5, 6)')
  })

  it('should let a theme from theme-css-src override the bundled viewer stylesheet', async () => {
    await mountViewer('<pdfjs-viewer-element theme-css-src="/tests/fixtures/custom-theme.css"></pdfjs-viewer-element>')

    const doc = getIframe().contentDocument!
    expect(getComputedStyle(doc.documentElement).getPropertyValue('--body-bg-color').trim()).eq('rgb(1, 2, 3)')
    expect(getComputedStyle(getViewerElement('#viewerContainer')!).position).eq('absolute')
  })

  it('should add a title attribute to the iframe', async () => {
    await mountViewer('<pdfjs-viewer-element iframe-title="Custom title"></pdfjs-viewer-element>')
    expect(getViewerElement()).exist
    expect(getIframe().title).eq('Custom title')
  })

  it('should apply hash-related attributes at runtime', async () => {
    await mountViewer(`
      <pdfjs-viewer-element></pdfjs-viewer-element>`
    )

    const viewer = document.body.querySelector('pdfjs-viewer-element') as HTMLElement
    viewer.setAttribute('page', '2')
    viewer.setAttribute('zoom', '200%')
    viewer.setAttribute('search', 'pdf')
    viewer.setAttribute('phrase', 'true')
    viewer.setAttribute('pagemode', 'thumbs')

    const hash = getIframe().contentWindow.location.hash
    expect(hash).toContain('page=2')
    expect(hash).toContain('zoom=200%')
    expect(hash).toContain('search=pdf')
    expect(hash).toContain('phrase=true')
    expect(hash).toContain('pagemode=thumbs')
  })

  it('should keep the current page when an unrelated hash attribute changes', async () => {
    const viewerApp = await mountViewer(`
      <pdfjs-viewer-element src="${pdfjsDist}/web/compressed.tracemonkey-pldi-09.pdf"></pdfjs-viewer-element>`
    ) as unknown as { page: number, isInitialViewSet: boolean }
    const contentWindow = getIframe().contentWindow
    expect(contentWindow.location.hash).eq('#pagemode=none')
    await vi.waitFor(() => expect(viewerApp.isInitialViewSet).toBe(true), { timeout: 10000 })

    viewerApp.page = 3
    const viewer = document.body.querySelector('pdfjs-viewer-element') as HTMLElement
    viewer.setAttribute('zoom', 'page-width')

    // No empty `page=`, which PDF.js reads as page 1, and no `pagemode`, which would close the sidebar.
    expect(contentWindow.location.hash).eq('#zoom=page-width')
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(viewerApp.page).eq(3)
  })

  it('should load a region locale from a relative template', async () => {
    const template = `${pdfjsDist}/web/locale/{locale}/viewer.ftl`
    await mountViewer(`
      <pdfjs-viewer-element locale="pt-BR" locale-src-template="${template}"></pdfjs-viewer-element>`
    )

    const doc = getIframe().contentDocument!
    const resource = doc.querySelector<HTMLLinkElement>('link[type="application/l10n"]')!
    expect(await (await fetch(resource.href)).json()).toEqual({
      'pt-br': new URL(template.replace('{locale}', 'pt-BR'), location.href).href
    })
    await vi.waitFor(() => expect(doc.querySelector('#previous')?.getAttribute('title')).eq('Página anterior'))
  })

  it('should load the locale under a page CSP that allows neither blob: nor data:', async () => {
    const viewer = await mountViewerWithPageCsp("connect-src 'self'", `
      <pdfjs-viewer-element
        locale="de"
        locale-src-template="${pdfjsDist}/web/locale/{locale}/viewer.ftl">
      </pdfjs-viewer-element>`
    )

    const doc = viewer.iframe.contentDocument!
    await vi.waitFor(() => expect(doc.querySelector('#previous')?.getAttribute('title')).eq('Eine Seite zurück'))
  })

  it('should fall back to English when the locale file fails to load', async () => {
    // The page CSP blocks the locale file's host, so the request fails without reaching the network.
    const viewer = await mountViewerWithPageCsp("connect-src 'self'", `
      <pdfjs-viewer-element
        locale="de"
        locale-src-template="https://locales.invalid/{locale}/viewer.ftl">
      </pdfjs-viewer-element>`
    )

    const doc = viewer.iframe.contentDocument!
    await vi.waitFor(() => expect(doc.querySelector('#previous')?.getAttribute('title')).eq('Previous Page'))
  })

  it('should keep the element and the viewer styled under a page CSP that blocks inline styles', async () => {
    const viewer = await mountViewerWithPageCsp("style-src 'self'", `
      <pdfjs-viewer-element></pdfjs-viewer-element>`
    ) as unknown as PdfjsViewerElement
    await viewer.injectViewerStyles('#outerContainer { letter-spacing: 3px }')

    const hostWindow = viewer.ownerDocument.defaultView!
    const viewerWindow = viewer.iframe.contentWindow
    const doc = viewer.iframe.contentDocument!
    expect(hostWindow.getComputedStyle(viewer).display).eq('block')
    expect(viewerWindow.getComputedStyle(doc.querySelector('#viewerContainer')!).position).eq('absolute')
    expect(viewerWindow.getComputedStyle(doc.querySelector('#outerContainer')!).letterSpacing).eq('3px')
  })

  it('should apply worker-src option at runtime', async () => {
    await mountViewer(`
      <pdfjs-viewer-element></pdfjs-viewer-element>`
    )

    const viewer = document.body.querySelector('pdfjs-viewer-element') as HTMLElement
    for (const workerSrc of ['https://example.com/pdf.worker.min.mjs', '/static/pdfjs/pdf.worker.abc.mjs', './pdf.worker.mjs']) {
      viewer.setAttribute('worker-src', workerSrc)

      const options = getIframe().contentWindow.PDFViewerApplicationOptions.getAll()
      expect(options.workerSrc).eq(new URL(workerSrc, location.href).href)
    }
  })

  it('should apply renderer-src option at runtime', async () => {
    await mountViewer(`
      <pdfjs-viewer-element></pdfjs-viewer-element>`
    )

    const viewer = document.body.querySelector('pdfjs-viewer-element') as HTMLElement
    for (const rendererSrc of ['https://example.com/pdf.renderer.min.mjs', '/static/pdfjs/pdf.renderer.abc.mjs', './pdf.renderer.mjs']) {
      viewer.setAttribute('renderer-src', rendererSrc)

      const options = getIframe().contentWindow.PDFViewerApplicationOptions.getAll()
      expect(options.rendererSrc).eq(new URL(rendererSrc, location.href).href)
    }
  })

  it('should include external worker origin in CSP script and worker directives', async () => {
    const workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/build/pdf.worker.min.mjs'

    await mountViewer(`
      <pdfjs-viewer-element
        worker-src="${workerSrc}">
      </pdfjs-viewer-element>`
    )

    const cspMeta = getIframe().contentDocument?.querySelector('meta[http-equiv="Content-Security-Policy"]')
    const csp = cspMeta?.getAttribute('content') || ''

    expect(csp).toMatch(/script-src[^;]*https:\/\/cdn\.jsdelivr\.net/)
    expect(csp).toMatch(/script-src-elem[^;]*https:\/\/cdn\.jsdelivr\.net/)
    expect(csp).toMatch(/worker-src[^;]*https:\/\/cdn\.jsdelivr\.net/)
  })

  it('should include external renderer origin in CSP script and worker directives', async () => {
    // A host under `.invalid` never resolves; the renderer worker only starts once worker rendering is on.
    await mountViewer(`
      <pdfjs-viewer-element
        renderer-src="https://renderer.invalid/pdf.renderer.min.mjs">
      </pdfjs-viewer-element>`
    )

    const cspMeta = getIframe().contentDocument?.querySelector('meta[http-equiv="Content-Security-Policy"]')
    const csp = cspMeta?.getAttribute('content') || ''

    expect(csp).toMatch(/script-src [^;]*https:\/\/renderer\.invalid/)
    expect(csp).toMatch(/script-src-elem [^;]*https:\/\/renderer\.invalid/)
    expect(csp).toMatch(/worker-src [^;]*https:\/\/renderer\.invalid/)
  })

  it('should load runtime files from assets-base', async () => {
    // Published dist folder with the flat layout the attribute expects; no trailing slash on purpose.
    const assetsBase = 'https://cdn.jsdelivr.net/npm/pdfjs-viewer-element@4.0.2/dist'

    await mountViewer(`
      <pdfjs-viewer-element
        assets-base="${assetsBase}">
      </pdfjs-viewer-element>`
    )

    const doc = getIframe().contentDocument!
    const stylesheets = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'))
      .map((link) => link.getAttribute('href'))
    expect(stylesheets).toContain(`${assetsBase}/viewer.css`)
    expect(stylesheets).toContain(`${assetsBase}/paper-and-ink.css`)

    const scripts = Array.from(doc.querySelectorAll('script[type="module"]'))
      .map((script) => script.getAttribute('src'))
    expect(scripts).toContain(`${assetsBase}/pdf.mjs`)
    expect(scripts).toContain(`${assetsBase}/viewer.mjs`)

    const options = getIframe().contentWindow.PDFViewerApplicationOptions.getAll()
    expect(options.workerSrc).eq(`${assetsBase}/pdf.worker.min.mjs`)
    expect(options.imageResourcesPath).eq(`${assetsBase}/images/`)

    const csp = doc.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') || ''
    expect(csp).toMatch(/script-src[^;]*https:\/\/cdn\.jsdelivr\.net/)
    expect(csp).toMatch(/style-src[^;]*https:\/\/cdn\.jsdelivr\.net/)

    expect(getViewerElement()).exist
  })

  it('should prefer worker-src over assets-base and fall back to it on remove', async () => {
    const assetsBase = 'https://cdn.jsdelivr.net/npm/pdfjs-viewer-element@4.0.2/dist/'
    const workerSrc = 'https://example.com/pdf.worker.min.mjs'

    await mountViewer(`
      <pdfjs-viewer-element
        assets-base="${assetsBase}"
        worker-src="${workerSrc}">
      </pdfjs-viewer-element>`
    )

    const viewer = document.body.querySelector('pdfjs-viewer-element') as HTMLElement
    let options = getIframe().contentWindow.PDFViewerApplicationOptions.getAll()
    expect(options.workerSrc).eq(workerSrc)

    viewer.removeAttribute('worker-src')
    options = getIframe().contentWindow.PDFViewerApplicationOptions.getAll()
    expect(options.workerSrc).eq(`${assetsBase}pdf.worker.min.mjs`)
  })

  it('should use built-in worker by default', async () => {
    await mountViewer(`
      <pdfjs-viewer-element></pdfjs-viewer-element>`
    )

    const options = getIframe().contentWindow.PDFViewerApplicationOptions.getAll()
    expect(options.workerSrc).contains('/build/pdf.worker.mjs')
    // PDF.js's own default is relative to its viewer page, which never resolves in the srcdoc frame.
    expect(options.rendererSrc).eq(new URL('/src/build/pdf.renderer.mjs', location.href).href)
  })

  it('should draw pages in the renderer worker when worker rendering is enabled', { timeout: 20_000 }, async () => {
    document.body.innerHTML = '<pdfjs-viewer-element></pdfjs-viewer-element>'
    const viewer = document.body.querySelector('pdfjs-viewer-element') as PdfjsViewerElement
    // PDF.js keeps worker rendering off. The option is applied when the viewer is built, so it is
    // set before the viewer exists.
    await viewer.setViewerOptions({ disableWorkerRendering: false })
    const { viewerApp } = await viewer.initPromise

    // Record the workers the viewer starts and what each one sends back.
    const win = getIframe().contentWindow as unknown as { Worker: typeof Worker, console: Console }
    const NativeWorker = win.Worker
    const workers: { url: string, messages: number, errors: number }[] = []
    win.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options)
        const record = { url: String(url), messages: 0, errors: 0 }
        workers.push(record)
        this.addEventListener('message', () => { record.messages++ })
        this.addEventListener('error', () => { record.errors++ })
      }
    }
    // A renderer worker that fails to start is only a warning: PDF.js draws on the main thread.
    const warnings: string[] = []
    const nativeWarn = win.console.warn.bind(win.console)
    win.console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(' '))
      nativeWarn(...args)
    }

    const rendered = new Promise<void>((resolve) => viewerApp!.eventBus.on('pagerendered', () => resolve()))
    await viewerApp!.open({ url: new URL(samplePdf, location.href).href })
    await rendered

    // The frame has no URL of its own, so PDF.js starts each worker from a `blob:` wrapper that
    // imports the script. Reading the wrapper tells the workers apart.
    const sources = await Promise.all(workers.map(async ({ url }) =>
      url.startsWith('blob:') ? (await fetch(url)).text() : url))
    const renderer = workers[sources.findIndex((source) => source.includes('/build/pdf.renderer.mjs'))]
    expect(renderer, 'the renderer worker starts from the built-in file').toBeDefined()
    expect(renderer.errors).eq(0)
    expect(renderer.messages).toBeGreaterThan(0)
    expect(warnings.filter((warning) => /renderer/i.test(warning))).toEqual([])
  })

  it('should apply extended option attributes at runtime and restore defaults on remove', async () => {
    await mountViewer(`
      <pdfjs-viewer-element></pdfjs-viewer-element>`
    )

    const viewer = document.body.querySelector('pdfjs-viewer-element') as HTMLElement
    const { viewerSrc, pdfjsLibSrc } = (viewer as PdfjsViewerElement)['getRuntimeFileUrls']()
    const cases = [
      {
        attr: 'c-map-url',
        key: 'cMapUrl',
        value: 'https://example.com/cmaps/',
        fallback: new URL('cmaps/', viewerSrc).href
      },
      {
        attr: 'icc-url',
        key: 'iccUrl',
        value: 'https://example.com/iccs/',
        fallback: new URL('iccs/', viewerSrc).href
      },
      {
        attr: 'image-resources-path',
        key: 'imageResourcesPath',
        value: 'https://example.com/images/',
        fallback: new URL('images/', viewerSrc).href
      },
      {
        attr: 'sandbox-bundle-src',
        key: 'sandboxBundleSrc',
        value: 'https://example.com/pdf.sandbox.mjs',
        fallback: new URL('pdf.sandbox.mjs', pdfjsLibSrc).href
      },
      {
        attr: 'standard-font-data-url',
        key: 'standardFontDataUrl',
        value: 'https://example.com/standard_fonts/',
        fallback: new URL('standard_fonts/', viewerSrc).href
      },
      {
        attr: 'wasm-url',
        key: 'wasmUrl',
        value: 'https://example.com/wasm/',
        fallback: new URL('wasm/', viewerSrc).href
      }
    ] as const

    for (const { attr, key, value, fallback } of cases) {
      viewer.setAttribute(attr, value)
      let options = getIframe().contentWindow.PDFViewerApplicationOptions.getAll() as Record<string, string>
      expect(options[key]).eq(value)

      viewer.removeAttribute(attr)
      options = getIframe().contentWindow.PDFViewerApplicationOptions.getAll() as Record<string, string>
      expect(options[key]).eq(fallback)
    }
  })

  it('should use a changed image-resources-path for the next document', async () => {
    const viewerApp = await mountViewer(`
      <pdfjs-viewer-element></pdfjs-viewer-element>`
    ) as unknown as { pdfViewer: { imageResourcesPath: string } }

    const viewer = document.body.querySelector('pdfjs-viewer-element') as HTMLElement
    viewer.setAttribute('image-resources-path', '/static/images')
    expect(viewerApp.pdfViewer.imageResourcesPath).eq(new URL('/static/images/', location.href).href)
  })

  it('should keep viewer options across a rebuild', async () => {
    document.body.innerHTML = `<pdfjs-viewer-element></pdfjs-viewer-element>`
    const viewer = document.body.querySelector('pdfjs-viewer-element') as PdfjsViewerElement
    viewer.setViewerOptions({ enableComment: true })
    await viewer.setViewerOptions({ defaultZoomValue: 'page-fit' })
    const options = () => getIframe().contentWindow.PDFViewerApplicationOptions.getAll()
    expect(options()).toMatchObject({ enableComment: true, defaultZoomValue: 'page-fit' })

    // A locale change that PDF.js can't apply in place rebuilds the viewer the same way.
    viewer.initPromise = viewer['buildViewer']()
    await viewer.initPromise
    expect(options()).toMatchObject({ enableComment: true, defaultZoomValue: 'page-fit' })
  })

  it('should load individual runtime URLs without assets-base', async () => {
    await mountViewer(`
      <pdfjs-viewer-element
        pdfjs-lib-src="/src/build/pdf.mjs?manifest=123"
        viewer-src="/src/web/viewer.mjs?manifest=123"
        worker-src="/src/build/pdf.worker.mjs?manifest=123"
        renderer-src="/src/build/pdf.renderer.mjs?manifest=123"
        viewer-css-src="/src/web/viewer.css?manifest=123"
        theme-css-src="/src/themes/paper-and-ink.css?manifest=123">
      </pdfjs-viewer-element>`
    )

    const doc = getIframe().contentDocument!
    for (const path of ['/src/build/pdf.mjs', '/src/web/viewer.mjs']) {
      expect(doc.querySelector(`script[src="${location.origin}${path}?manifest=123"]`)).exist
    }
    for (const path of ['/src/web/viewer.css', '/src/themes/paper-and-ink.css']) {
      expect(doc.querySelector(`link[href="${location.origin}${path}?manifest=123"]`)).exist
    }
    const options = getIframe().contentWindow.PDFViewerApplicationOptions.getAll()
    expect(options.workerSrc).eq(new URL('/src/build/pdf.worker.mjs?manifest=123', location.href).href)
    expect(options.rendererSrc).eq(new URL('/src/build/pdf.renderer.mjs?manifest=123', location.href).href)
    expect(getViewerElement()).exist
  })

  it('should include individual runtime URL origins in CSP', async () => {
    // Hosts under `.invalid` never resolve: the CSP is written before the scripts fail to load.
    document.body.innerHTML = `
      <pdfjs-viewer-element
        pdfjs-lib-src="https://pdfjs-lib.invalid/pdf.mjs"
        viewer-src="https://viewer.invalid/viewer.mjs"
        viewer-css-src="https://viewer-css.invalid/viewer.css"
        theme-css-src="https://theme-css.invalid/paper-and-ink.css">
      </pdfjs-viewer-element>`
    const viewer = document.body.querySelector('pdfjs-viewer-element') as PdfjsViewerElement
    await viewer.initPromise.catch(() => {})

    const cspMeta = getIframe().contentDocument?.querySelector('meta[http-equiv="Content-Security-Policy"]')
    const csp = cspMeta?.getAttribute('content') || ''
    expect(csp).toMatch(/script-src-elem[^;]*https:\/\/pdfjs-lib\.invalid/)
    expect(csp).toMatch(/script-src-elem[^;]*https:\/\/viewer\.invalid/)
    expect(csp).toMatch(/style-src[^;]*https:\/\/viewer-css\.invalid/)
    expect(csp).toMatch(/style-src[^;]*https:\/\/theme-css\.invalid/)
  })

  it('should include cross-origin sandbox, WASM and annotation icon URLs in CSP', async () => {
    document.body.innerHTML = `
      <pdfjs-viewer-element
        sandbox-bundle-src="https://sandbox.invalid/pdf.sandbox.mjs"
        wasm-url="https://wasm.invalid/wasm/"
        image-resources-path="https://images.invalid/images/">
      </pdfjs-viewer-element>`
    const viewer = document.body.querySelector('pdfjs-viewer-element') as PdfjsViewerElement
    await viewer.initPromise

    const cspMeta = getIframe().contentDocument?.querySelector('meta[http-equiv="Content-Security-Policy"]')
    const csp = cspMeta?.getAttribute('content') || ''
    for (const directive of ['script-src', 'script-src-elem']) {
      expect(csp).toMatch(new RegExp(`${directive} [^;]*https://sandbox\\.invalid`))
      expect(csp).toMatch(new RegExp(`${directive} [^;]*https://wasm\\.invalid`))
    }
    expect(csp).toMatch(/img-src[^;]*https:\/\/images\.invalid/)
    expect(csp).not.toMatch(/style-src[^;]*https:\/\/images\.invalid/)
  })

  it('should keep the runtime URLs read at connection for the whole build', async () => {
    document.body.innerHTML = `<pdfjs-viewer-element></pdfjs-viewer-element>`
    const viewer = document.body.querySelector('pdfjs-viewer-element') as PdfjsViewerElement
    viewer.setAttribute('pdfjs-lib-src', 'https://pdfjs-lib.invalid/pdf.mjs')
    await viewer.initPromise

    expect(getIframe().contentDocument!.querySelector('script[src^="https://pdfjs-lib.invalid"]')).not.exist
    expect(getViewerElement()).exist
  })

  it('should not inject markup from an invalid stylesheet URL', async () => {
    // The theme stylesheet is optional, so the viewer still initializes without it.
    const invalidUrl = 'http://[invalid"><link rel="stylesheet" href="/injected.css">'
    await mountViewer(`
      <pdfjs-viewer-element theme-css-src='${invalidUrl}'></pdfjs-viewer-element>`
    )

    const doc = getIframe().contentDocument!
    const stylesheets = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'))
      .map((link) => link.getAttribute('href'))
    expect(stylesheets).toContain(invalidUrl)
    expect(stylesheets).not.toContain('/injected.css')
    expect(getViewerElement()).exist
  })

  it('should open a new document when src changes at runtime', async () => {
    const viewerApp = await mountViewer(`
      <pdfjs-viewer-element></pdfjs-viewer-element>`
    )

    const viewer = document.body.querySelector('pdfjs-viewer-element') as HTMLElement
    let openedUrl = ''
    const originalOpen = viewerApp?.open
    if (viewerApp) {
      viewerApp.open = ((params: { url: string } | { data: Uint8Array }) => {
        if (typeof params === 'object' && 'url' in params) {
          openedUrl = params.url
        }
      }) as typeof viewerApp.open
    }

    viewer.setAttribute('src', '/sample-pdf-with-images.pdf')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(openedUrl).toContain('/sample-pdf-with-images.pdf')
    if (viewerApp && originalOpen) {
      viewerApp.open = originalOpen
    }
  })
})

describe('Resource URL attributes', () => {
  it('makes values absolute and ends folder URLs with a slash', () => {
    const viewer = new PdfjsViewerElement()
    const cases = [
      ['c-map-url', '/static/cmaps', new URL('/static/cmaps/', location.href).href],
      ['standard-font-data-url', './fonts/', new URL('./fonts/', location.href).href],
      ['wasm-url', 'https://cdn.example.com/wasm', 'https://cdn.example.com/wasm/'],
      ['icc-url', '  /static/iccs/  ', new URL('/static/iccs/', location.href).href],
      ['image-resources-path', '../images', new URL('../images/', location.href).href],
      ['sandbox-bundle-src', '/static/pdf.sandbox.mjs', new URL('/static/pdf.sandbox.mjs', location.href).href]
    ] as const

    for (const [attribute, value, expected] of cases) {
      const fallback = viewer['getResourceOption'](attribute)
      viewer.setAttribute(attribute, value)
      expect(viewer['getResourceOption'](attribute)).eq(expected)
      viewer.setAttribute(attribute, ' ')
      expect(viewer['getResourceOption'](attribute)).eq(fallback)
    }
  })

  it('defaults to resources that ship next to the runtime files', async () => {
    const viewer = new PdfjsViewerElement()
    const files = {
      'c-map-url': 'Adobe-Japan1-UCS2.bcmap',
      'icc-url': 'CGATS001Compat-v2-micro.icc',
      'image-resources-path': 'annotation-comment.svg',
      'sandbox-bundle-src': '',
      'standard-font-data-url': 'FoxitFixed.pfb',
      'wasm-url': 'openjpeg.wasm'
    } as const

    for (const [attribute, file] of Object.entries(files)) {
      const url = viewer['getResourceOption'](attribute as keyof typeof files) + file
      // The dev server answers a missing file with its HTML page and a 200, so check the type.
      const response = await fetch(url, { method: 'HEAD' })
      expect(response.headers.get('content-type') ?? '', url).not.toMatch(/text\/html/)
    }
  })

  it('makes the defaults absolute when a bundler rewrites them to relative URLs', async () => {
    // Next.js returns `new URL('./file', import.meta.url).href` as a root-relative path. A fresh copy
    // of the module is evaluated with a URL class that does the same for the module's runtime files.
    const NativeURL = URL
    class RelativeURL extends NativeURL {
      override get href() {
        return /^\/src\/(build|web|themes)\//.test(this.pathname) ? this.pathname : super.href
      }
    }
    globalThis.URL = RelativeURL
    let RelativeElement: typeof PdfjsViewerElement
    try {
      ({ PdfjsViewerElement: RelativeElement } = await import(/* @vite-ignore */ '/src/pdfjs-viewer-element.ts?relative-urls'))
    } finally {
      globalThis.URL = NativeURL
    }
    if (!customElements.get('pdfjs-viewer-relative-urls')) {
      customElements.define('pdfjs-viewer-relative-urls', RelativeElement)
    }

    document.body.innerHTML = '<pdfjs-viewer-relative-urls></pdfjs-viewer-relative-urls>'
    const viewer = document.body.querySelector('pdfjs-viewer-relative-urls') as PdfjsViewerElement
    await viewer.initPromise

    const options = viewer.iframe.contentWindow.PDFViewerApplicationOptions.getAll()
    expect(options.workerSrc).eq(new URL('/src/build/pdf.worker.mjs', location.href).href)
    expect(options.rendererSrc).eq(new URL('/src/build/pdf.renderer.mjs', location.href).href)
    expect(options.cMapUrl).eq(new URL('/src/web/cmaps/', location.href).href)
    expect(options.sandboxBundleSrc).eq(new URL('/src/build/pdf.sandbox.mjs', location.href).href)
  })

  it('follows assets-base', () => {
    const viewer = new PdfjsViewerElement()
    viewer.setAttribute('assets-base', '/static/pdfjs')
    expect(viewer['getResourceOption']('c-map-url')).eq(new URL('/static/pdfjs/cmaps/', location.href).href)
    expect(viewer['getResourceOption']('sandbox-bundle-src')).eq(new URL('/static/pdfjs/pdf.sandbox.mjs', location.href).href)
  })
})

describe('Runtime file URL overrides', () => {
  it('defaults to worker scripts that ship with the viewer files', async () => {
    const urls = new PdfjsViewerElement()['getRuntimeFileUrls']()
    for (const url of [urls.workerSrc, urls.rendererSrc]) {
      // The dev server answers a missing file with its HTML page and a 200, so check the type.
      const response = await fetch(url, { method: 'HEAD' })
      expect(response.headers.get('content-type'), url).toMatch(/javascript/)
    }
  })

  const files = {
    workerSrc: ['worker-src', 'pdf.worker.min.mjs'],
    rendererSrc: ['renderer-src', 'pdf.renderer.min.mjs'],
    pdfjsLibSrc: ['pdfjs-lib-src', 'pdf.mjs'],
    viewerSrc: ['viewer-src', 'viewer.mjs'],
    viewerCssSrc: ['viewer-css-src', 'viewer.css'],
    themeCssSrc: ['theme-css-src', 'paper-and-ink.css']
  } as const

  it.each([undefined, '/static/pdfjs'])('resolves individual URLs with assets-base=%s', (assetsBase) => {
    const viewer = new PdfjsViewerElement()
    if (assetsBase) viewer.setAttribute('assets-base', assetsBase)
    const defaults = viewer['getRuntimeFileUrls']()

    for (const [key, [attribute, file]] of Object.entries(files)) {
      const field = key as keyof typeof files
      const path = `/static/hashed/${file}?v=123`
      viewer.setAttribute(attribute, path)
      expect(viewer['getRuntimeFileUrls']()[field]).eq(new URL(path, location.href).href)
      viewer.setAttribute(attribute, 'https://cdn.example.com/' + file)
      expect(viewer['getRuntimeFileUrls']()[field]).eq('https://cdn.example.com/' + file)
      viewer.setAttribute(attribute, '')
      expect(viewer['getRuntimeFileUrls']()[field]).eq(defaults[field])
      viewer.setAttribute(attribute, ' \t\n ')
      expect(viewer['getRuntimeFileUrls']()[field]).eq(defaults[field])
      viewer.setAttribute(attribute, `  ${path}  `)
      expect(viewer['getRuntimeFileUrls']()[field]).eq(new URL(path, location.href).href)
      viewer.removeAttribute(attribute)
      expect(viewer['getRuntimeFileUrls']()).toEqual(defaults)
      if (assetsBase) {
        expect(defaults[field]).eq(new URL(`${assetsBase}/${file}`, location.href).href)
      }
    }
  })
})
