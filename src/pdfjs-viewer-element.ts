import type { DocumentInitParameters } from 'pdfjs-dist/types/src/display/api'
import type { EventBus } from 'pdfjs-dist/types/web/event_utils'

// The viewer runtime files ship next to this module (see scripts/copy-worker.mjs) and are
// resolved relative to `import.meta.url`. The production file names do not exist next to this
// source file at build time, so without `@vite-ignore` Vite would rewrite the calls to
// `new URL('./file', '' + import.meta.url)`, a form consumer bundlers skip. Kept as plain
// `new URL('./file', import.meta.url)`, Vite, Rollup and webpack in the consuming app emit the
// files as assets and rewrite the URLs themselves. Bundlers that do not analyse this pattern
// relocate the module without the files; those hosts serve the package `dist` folder from a
// static path and point `assets-base` at it.
const DEFAULT_BUILT_IN_WORKER_SRC = import.meta.env.DEV
  ? new URL('./build/pdf.worker.mjs', import.meta.url).href
  : new URL(/* @vite-ignore */ './pdf.worker.min.mjs', import.meta.url).href

const DEFAULT_PDF_SRC = import.meta.env.DEV
  ? new URL('./build/pdf.mjs', import.meta.url).href
  : new URL(/* @vite-ignore */ './pdf.mjs', import.meta.url).href

const DEFAULT_VIEWER_SRC = import.meta.env.DEV
  ? new URL('./web/viewer.mjs', import.meta.url).href
  : new URL(/* @vite-ignore */ './viewer.mjs', import.meta.url).href

const DEFAULT_VIEWER_CSS_SRC = import.meta.env.DEV
  ? new URL('./web/viewer.css', import.meta.url).href
  : new URL(/* @vite-ignore */ './viewer.css', import.meta.url).href

const DEFAULT_PAPER_AND_INK_THEME_CSS_SRC = import.meta.env.DEV
  ? new URL('./themes/paper-and-ink.css', import.meta.url).href
  : new URL(/* @vite-ignore */ './paper-and-ink.css', import.meta.url).href

// Runtime files of the viewer: the attribute that overrides each URL, the file name inside the
// package `dist` folder (used when `assets-base` is set) and the bundled default.
const RUNTIME_FILES = {
  workerSrc: { attribute: 'worker-src', fileName: 'pdf.worker.min.mjs', defaultUrl: DEFAULT_BUILT_IN_WORKER_SRC },
  pdfjsLibSrc: { attribute: 'pdfjs-lib-src', fileName: 'pdf.mjs', defaultUrl: DEFAULT_PDF_SRC },
  viewerSrc: { attribute: 'viewer-src', fileName: 'viewer.mjs', defaultUrl: DEFAULT_VIEWER_SRC },
  viewerCssSrc: { attribute: 'viewer-css-src', fileName: 'viewer.css', defaultUrl: DEFAULT_VIEWER_CSS_SRC },
  themeCssSrc: { attribute: 'theme-css-src', fileName: 'paper-and-ink.css', defaultUrl: DEFAULT_PAPER_AND_INK_THEME_CSS_SRC }
} as const

type RuntimeFileUrls = Record<keyof typeof RUNTIME_FILES, string>

const DEFAULTS = {
  src: '',
  iframeTitle: 'PDF viewer window',
  page: '',
  search: '',
  phrase: '',
  zoom: '',
  pagemode: 'none',
  locale: '',
  viewerCssTheme: 'AUTOMATIC',
  localeSrcTemplate: 'https://cdn.jsdelivr.net/gh/mozilla-l10n/firefox-l10n@main/{locale}/toolkit/toolkit/pdfviewer/viewer.ftl'
} as const

// Resources PDF.js loads only for documents that need them. They ship in the package `dist`
// folder, and each defaults to `fileName` resolved against the runtime file named by `base`, so
// `assets-base` and the individual runtime URLs carry them along. Bundlers emit the runtime files
// but not these folders, so bundled apps set `assets-base` or the attributes.
// PDF.js fetches most of them from its worker, which runs from a `blob:` URL where relative paths
// don't resolve, so attribute values are made absolute, and folder URLs get the trailing slash
// PDF.js requires.
const RESOURCE_OPTIONS = {
  'c-map-url': { key: 'cMapUrl', fileName: 'cmaps/', base: 'viewerSrc' },
  'icc-url': { key: 'iccUrl', fileName: 'iccs/', base: 'viewerSrc' },
  'image-resources-path': { key: 'imageResourcesPath', fileName: 'images/', base: 'viewerSrc' },
  'sandbox-bundle-src': { key: 'sandboxBundleSrc', fileName: 'pdf.sandbox.mjs', base: 'pdfjsLibSrc' },
  'standard-font-data-url': { key: 'standardFontDataUrl', fileName: 'standard_fonts/', base: 'viewerSrc' },
  'wasm-url': { key: 'wasmUrl', fileName: 'wasm/', base: 'viewerSrc' }
} as const

type ResourceAttribute = keyof typeof RESOURCE_OPTIONS

export const ViewerCssTheme = { AUTOMATIC: 0, LIGHT: 1, DARK: 2 } as const

export type PdfViewerApplicationOpenParameters =
  (DocumentInitParameters & { originalUrl?: string }) | Uint8Array

export type PdfViewerApplicationOptionValue =
  string | boolean | number | Record<string, unknown>

export interface PdfViewerApplication {
  initializedPromise: Promise<void>
  initialized: boolean
  eventBus: EventBus
  open: (params: PdfViewerApplicationOpenParameters) => void | Promise<void>
}

export interface PdfViewerApplicationOptions {
  set: (name: string, value: PdfViewerApplicationOptionValue) => void
  getAll: () => Record<string, unknown>
}

export class PdfjsViewerElement extends HTMLElement {
  constructor() {
    super()
    const shadowRoot = this.attachShadow({ mode: 'open' })
    shadowRoot.innerHTML = `
      <style>:host{width:100%;display:block;overflow:hidden}:host iframe{height:100%}</style>
      <iframe frameborder="0" width="100%" loading="lazy"></iframe>
    `
  }

  public iframe!: PdfjsViewerElementIframe
  public initPromise: Promise<InitializationData> = Promise.resolve({})
  private localeResourceUrl?: string
  private localeResourceLink?: HTMLLinkElement
  private viewerStyles = new Set<string>()
  private optionsToSet: Record<string, PdfViewerApplicationOptionValue> = {}

  static get observedAttributes() {
    return[
      'src', 'locale', 'viewer-css-theme', 'worker-src',
      'c-map-url', 'icc-url', 'image-resources-path',
      'sandbox-bundle-src', 'standard-font-data-url', 'wasm-url',
      'page', 'search', 'phrase', 'zoom', 'pagemode', 'iframe-title'
    ]
  }

  private formatTemplate(template: string, params: Record<string, any>) {
    return template.replace(/\{(\w+)\}/g, (_, key) => {
      if (!(key in params)) throw new Error(`Missing param: ${key}`);
      return String(params[key]);
    });
  }

  private getFullPath(path: string) {
    if (!path) return path

    try {
      return new URL(path, window.location.href).href
    } catch {
      return path
    }
  }

  private getAssetsBase() {
    const value = this.getAttribute('assets-base')?.trim()
    if (!value) return ''
    return this.getFullPath(value.endsWith('/') ? value : `${value}/`)
  }

  // Read when the viewer is (re)built, so the attribute must be present before connection.
  private getRuntimeFileUrls(): RuntimeFileUrls {
    const assetsBase = this.getAssetsBase()

    const resolveFile = (field: keyof typeof RUNTIME_FILES) => {
      const { attribute, fileName, defaultUrl } = RUNTIME_FILES[field]
      const attr = this.getAttribute(attribute)?.trim()
      if (attr) return this.getFullPath(attr)
      if (!assetsBase) return defaultUrl

      try {
        return new URL(fileName, assetsBase).href
      } catch {
        return `${assetsBase}${fileName}`
      }
    }

    return {
      workerSrc: resolveFile('workerSrc'),
      pdfjsLibSrc: resolveFile('pdfjsLibSrc'),
      viewerSrc: resolveFile('viewerSrc'),
      viewerCssSrc: resolveFile('viewerCssSrc'),
      themeCssSrc: resolveFile('themeCssSrc')
    }
  }

  private getResourceOption(attribute: ResourceAttribute) {
    const { fileName, base } = RESOURCE_OPTIONS[attribute]
    const value = this.getAttribute(attribute)?.trim()
    if (value) {
      return this.getFullPath(fileName.endsWith('/') && !value.endsWith('/') ? `${value}/` : value)
    }

    try {
      return new URL(fileName, this.getRuntimeFileUrls()[base]).href
    } catch {
      // A runtime URL that doesn't parse can't load the viewer either.
      return fileName
    }
  }

  private getCssThemeOption() {
    const attrValue = this.getAttribute('viewer-css-theme') as keyof typeof ViewerCssTheme
    return Object.keys(ViewerCssTheme).includes(attrValue) 
      ? ViewerCssTheme[attrValue] 
      : ViewerCssTheme[DEFAULTS.viewerCssTheme]
  }

  private applyIframeHash = async (initial = false) =>{
    const contentWindow = this.iframe?.contentWindow
    if (!contentWindow) return

    const hash = this.getIframeLocationHash(initial)
    if (contentWindow.location.hash === hash) return

    await new Promise<void>((resolve) => {
      let settled = false
      const onHashChange = () => {
        if (settled) return
        settled = true
        contentWindow.removeEventListener('hashchange', onHashChange)
        resolve()
      }

      contentWindow.addEventListener('hashchange', onHashChange)
      contentWindow.location.hash = hash

      queueMicrotask(() => {
        if (contentWindow.location.hash === hash) {
          onHashChange()
        }
      })
    })
  }

  private applyViewerTheme() {
    const theme = this.getCssThemeOption()
    const viewerOptions = this.iframe.contentWindow?.PDFViewerApplicationOptions
    viewerOptions?.set('viewerCssTheme', theme)

    // The theme stylesheet selects its forced palettes by `data-color-scheme`; the inline
    // `color-scheme` is what PDF.js itself sets for the browser UI.
    const doc = this.iframe.contentDocument
    if (!doc?.documentElement) return
    const mode = theme === ViewerCssTheme.LIGHT ? 'light' : theme === ViewerCssTheme.DARK ? 'dark' : ''
    if (mode) {
      doc.documentElement.style.setProperty('color-scheme', mode)
      doc.documentElement.setAttribute('data-color-scheme', mode)
    } else {
      doc.documentElement.style.removeProperty('color-scheme')
      doc.documentElement.removeAttribute('data-color-scheme')
    }
  }

  private appendRuntimeStyle(styles: string) {
    const doc = this.iframe?.contentDocument
    if (!doc?.head || !styles) return

    const exists = Array.from(doc.querySelectorAll('style'))
      .some((styleNode) => styleNode.textContent === styles)
    if (exists) return

    const styleElement = doc.createElement('style')
    styleElement.setAttribute('data-pdfjs-viewer-runtime-style', 'true')
    styleElement.textContent = styles
    doc.head.appendChild(styleElement)
  }

  private applyQueuedRuntimeStyles() {
    this.viewerStyles.forEach((styles) => {
      this.appendRuntimeStyle(styles)
    })
  }

  private injectScript(src: string, type = 'module') {
    const doc = this.iframe.contentDocument
    if (!doc) return Promise.resolve()
    if (!doc.head) {
      const head = doc.createElement('head')
      doc.documentElement?.prepend(head)
    }

    return new Promise<void>((resolve, reject) => {
      let cspViolationDetails = ''

      const onSecurityPolicyViolation = (event: SecurityPolicyViolationEvent) => {
        const directive = event.effectiveDirective || event.violatedDirective || 'unknown-directive'
        const blockedUri = event.blockedURI || 'unknown-uri'
        cspViolationDetails = ` (CSP ${directive} blocked ${blockedUri})`
      }

      const cleanup = () => {
        doc.removeEventListener('securitypolicyviolation', onSecurityPolicyViolation)
      }

      doc.addEventListener('securitypolicyviolation', onSecurityPolicyViolation)

      const script = doc.createElement('script')
      script.type = type
      script.src = src
      script.addEventListener('load', () => {
        cleanup()
        resolve()
      }, { once: true })
      script.addEventListener('error', () => {
        cleanup()
        reject(new Error(`Unable to load script: ${src}${cspViolationDetails}`))
      }, { once: true })
      doc.head?.appendChild(script)
    })
  }

  private applyLocaleAtRuntime = async () => {
    const viewerApp = this.iframe.contentWindow?.PDFViewerApplication as unknown as {
      initializedPromise?: Promise<void>
      externalServices?: { createL10n?: () => Promise<any> }
      l10n?: { destroy?: () => Promise<void> }
      appConfig?: { appContainer?: HTMLElement }
    }

    const doc = this.iframe.contentDocument
    if (!viewerApp || !doc) return false

    await viewerApp.initializedPromise
    const createL10n = viewerApp.externalServices?.createL10n
    if (typeof createL10n !== 'function') return false

    const nextL10n = await createL10n()
    if (!nextL10n) return false

    await viewerApp.l10n?.destroy?.()
    viewerApp.l10n = nextL10n

    const root = viewerApp.appConfig?.appContainer || doc.documentElement
    if (!root) return false

    if (typeof nextL10n.getDirection === 'function') {
      doc.documentElement?.setAttribute('dir', nextL10n.getDirection())
    }

    if (typeof nextL10n.translate === 'function') {
      await nextL10n.translate(root)
    }

    return true
  }

  private injectLocaleData = async () => {
    const doc = this.iframe.contentDocument as Document
    const locale = this.getAttribute('locale')
    if (!locale) {
      this.cleanupLocaleResource()
      return
    }
    const localesData = await import('./web/locale/locale.json?raw')
    // PDF.js looks bundles up by the lowercase code (`pt-br`), the key format of `locale.json`,
    // while the locale folders keep their case (`pt-BR/viewer.ftl`), so the template gets the folder.
    const lang = locale.trim().toLowerCase()
    const localePath: string | undefined = JSON.parse(localesData.default)[lang]
    if (!localePath) {
      this.cleanupLocaleResource()
      return
    }
    // Made absolute because PDF.js resolves it against the `blob:` URL of the resource link below.
    const localeUrl = this.getFullPath(this.formatTemplate(
      this.getAttribute('locale-src-template') || DEFAULTS.localeSrcTemplate,
      { locale: localePath.split('/')[0] }
    ))
    const localeObject = {
      [lang]: localeUrl
    }
    const localeLink = doc.createElement('link')
    localeLink.rel = 'resource'
    localeLink.type = 'application/l10n'
    this.cleanupLocaleResource()
    this.localeResourceUrl = URL.createObjectURL(
      new Blob([JSON.stringify(localeObject)], { type: 'application/json' })
    )
    localeLink.href = this.localeResourceUrl
    this.iframe.contentDocument?.head.appendChild(localeLink)
    this.localeResourceLink = localeLink
  }

  private cleanupLocaleResource() {
    if (this.localeResourceLink) {
      this.localeResourceLink.remove()
      this.localeResourceLink = undefined
    }
    if (this.localeResourceUrl) {
      URL.revokeObjectURL(this.localeResourceUrl)
      this.localeResourceUrl = undefined
    }
  }

  private onViewerAppCreated = () =>
    new Promise<IframeWindow['PDFViewerApplication']>((resolve) => {
      const contentWindow = this.iframe.contentWindow as IframeWindow
      if (contentWindow.PDFViewerApplication) return resolve(contentWindow.PDFViewerApplication)

      let appValue: IframeWindow['PDFViewerApplication'] | undefined

      Object.defineProperty(contentWindow, 'PDFViewerApplication', {
        get() { return appValue },
        set(value: IframeWindow['PDFViewerApplication']) {
          appValue = value
          resolve(value)
          delete contentWindow.PDFViewerApplication
          contentWindow.PDFViewerApplication = value
        },
        configurable: true
      });
    });

  private applyViewerOptions = () => {
    const viewerOptions = this.iframe.contentWindow?.PDFViewerApplicationOptions
    viewerOptions?.set('workerSrc', this.getRuntimeFileUrls().workerSrc)
    for (const [attribute, { key }] of Object.entries(RESOURCE_OPTIONS)) {
      viewerOptions?.set(key, this.getResourceOption(attribute as ResourceAttribute))
    }
    viewerOptions?.set('defaultUrl', this.getFullPath(this.getAttribute('src') || DEFAULTS.src))
    viewerOptions?.set('disablePreferences', true)
    viewerOptions?.set('eventBusDispatchToDOM', true)
    viewerOptions?.set('localeProperties', { lang: this.getAttribute('locale') || DEFAULTS.locale })
    viewerOptions?.set('viewerCssTheme', this.getCssThemeOption())
    for (const [key, value] of Object.entries(this.optionsToSet)) {
      viewerOptions?.set(key, value)
    }
    this.optionsToSet = {}
  }

  // Unset parameters are left out: PDF.js reads an empty `page=` as page 1, so writing them would
  // move the reader whenever another attribute changes. For the same reason `pagemode` falls back
  // to `none` only when the viewer is built, and later changes leave the reader's sidebar alone.
  private getIframeLocationHash = (initial = false) => {
    const params: Record<string, string> = {
      page: this.getAttribute('page') || DEFAULTS.page,
      zoom: this.getAttribute('zoom') || DEFAULTS.zoom,
      pagemode: this.getAttribute('pagemode') || (initial ? DEFAULTS.pagemode : ''),
      search: this.getAttribute('search') || DEFAULTS.search,
      phrase: this.getAttribute('phrase') || DEFAULTS.phrase,
      locale: this.getAttribute('locale') || DEFAULTS.locale
    }
    const query = Object.entries(params).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('&')
    // An empty hash reads back as '' from `location.hash`, so return '' rather than '#'.
    return query ? `#${query}` : ''
  }

  private buildViewerEntry = async (runtimeFileUrls: RuntimeFileUrls) => {
    return new Promise<void>(async (resolve) => {
      const viewerEntry = await import('virtual:pdfjs-viewer-html')
      const resolveHttpOrigin = (url: string) => {
        try {
          const parsed = new URL(url, window.location.href)
          if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return parsed.origin
          }
        } catch {
          // Ignore invalid URLs and keep CSP fallback values.
        }
        return ''
      }

      const toSourceList = (sources: string[]) =>
        Array.from(new Set(sources.filter(Boolean))).join(' ')

      // Attribute values that are not valid URLs reach the markup as written, so escape them.
      const escapeAttribute = (value: string) =>
        value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

      const { pdfjsLibSrc, viewerSrc, viewerCssSrc, themeCssSrc, workerSrc } = runtimeFileUrls
      const workerSrcOrigin = resolveHttpOrigin(workerSrc)

      const scriptSources = toSourceList([
        "'self'",
        window.location.origin,
        resolveHttpOrigin(pdfjsLibSrc),
        resolveHttpOrigin(viewerSrc),
        workerSrcOrigin
      ])

      const styleSources = toSourceList([
        "'self'",
        window.location.origin,
        resolveHttpOrigin(viewerCssSrc),
        resolveHttpOrigin(themeCssSrc)
      ])

      const workerSources = toSourceList([
        "'self'",
        'blob:',
        window.location.origin,
        workerSrcOrigin
      ])

      const srcdocCsp = [
        "default-src 'none'",
        `script-src ${scriptSources} 'wasm-unsafe-eval'`,
        `script-src-elem ${scriptSources}`,
        `worker-src ${workerSources}`,
        `style-src ${styleSources} 'unsafe-inline'`,
        `img-src ${styleSources} blob: data:`,
        'media-src blob:',
        `font-src ${styleSources} data:`,
        'connect-src * blob: data:',
        "base-uri 'none'",
        "form-action 'none'"
      ].join('; ')

      const viewerHtmlWithSrcdocCsp = viewerEntry.default.replace(
        /<meta\s+http-equiv="Content-Security-Policy"[^>]*>/i,
        `<meta http-equiv="Content-Security-Policy" content="${srcdocCsp};" />`
      )

      const completeHtml = viewerHtmlWithSrcdocCsp
        .replace('</head>', `
          <link rel="stylesheet" href="${escapeAttribute(viewerCssSrc)}">
          <link rel="stylesheet" href="${escapeAttribute(themeCssSrc)}">
          ${Array.from(this.viewerStyles).map(style => `<style>${style}</style>`).join('\n')}
        </head>`)
      this.iframe.addEventListener('load', () => resolve(), { once: true })
      this.iframe.srcdoc = completeHtml
    })
  }

  private setupViewerApp = async () => {
    const viewerApp = await this.onViewerAppCreated()
    this.applyViewerOptions()
    // Applied before initialization so a forced palette is in place when the viewer first paints.
    this.applyViewerTheme()
    await viewerApp?.initializedPromise

    this.applyViewerTheme()
    this.applyQueuedRuntimeStyles()

    return {
      viewerApp
    }
  }

  private buildViewerApp = async (runtimeFileUrls: RuntimeFileUrls) => {
    await this.applyIframeHash(true)

    // Set viewer options as soon as PDFViewerApplication is created.
    const setupPromise = this.setupViewerApp()

    await this.injectLocaleData()

    await this.injectScript(runtimeFileUrls.pdfjsLibSrc)
    await this.injectScript(runtimeFileUrls.viewerSrc)

    return await setupPromise
  }

  // Runtime file URLs are read once per build, so the srcdoc CSP always allows the files it loads.
  private buildViewer = async () => {
    const runtimeFileUrls = this.getRuntimeFileUrls()
    await this.buildViewerEntry(runtimeFileUrls)
    return await this.buildViewerApp(runtimeFileUrls)
  }

  async connectedCallback() {
    this.iframe = this.shadowRoot?.querySelector('iframe') as PdfjsViewerElementIframe
    this.iframe.setAttribute('title', this.getAttribute('iframe-title') || DEFAULTS.iframeTitle)
    this.initPromise = this.buildViewer()
  }
  
  disconnectedCallback() {
    this.cleanupLocaleResource()
    this.iframe.src = 'about:blank'
    while (this.firstChild) {
      this.removeChild(this.firstChild);
    }
  }

  async attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    if (oldValue === newValue) return
    if (!this.iframe) return

    if (name === 'worker-src') {
      const viewerOptions = this.iframe.contentWindow?.PDFViewerApplicationOptions
      viewerOptions?.set('workerSrc', this.getRuntimeFileUrls().workerSrc)
      return
    }

    if (name in RESOURCE_OPTIONS) {
      const viewerOptions = this.iframe.contentWindow?.PDFViewerApplicationOptions
      const attribute = name as ResourceAttribute
      viewerOptions?.set(RESOURCE_OPTIONS[attribute].key, this.getResourceOption(attribute))
      return
    }

    switch (name) {
      case 'src': {
        const viewerApp = this.iframe.contentWindow?.PDFViewerApplication
        if (viewerApp) {
          await viewerApp.initializedPromise
          const url = this.getFullPath(newValue || DEFAULTS.src)
          if (url) {
            viewerApp.open({ url })
          }
        }
        return
      }
      case 'locale': {
        const viewerOptions = this.iframe.contentWindow?.PDFViewerApplicationOptions
        viewerOptions?.set('localeProperties', { lang: newValue || DEFAULTS.locale })
        this.cleanupLocaleResource()

        await this.injectLocaleData()
        const didApplyRuntimeLocale = await this.applyLocaleAtRuntime()
        if (!didApplyRuntimeLocale) {
          this.initPromise = this.buildViewer()
          await this.initPromise
        }
        await this.applyIframeHash()
        return
      }
      case 'iframe-title':
        this.iframe.setAttribute('title', newValue || DEFAULTS.iframeTitle)
        return
      case 'viewer-css-theme':
        this.applyViewerTheme()
        return
      default:
        await this.applyIframeHash()
    }
  }

  public async injectViewerStyles(styles: string) {
    if (!styles) return
    this.viewerStyles.add(styles)
    this.appendRuntimeStyle(styles)
  }

  public async setViewerOptions(options: Record<string, PdfViewerApplicationOptionValue> = {}) {
    this.optionsToSet = options
    await this.initPromise
    return {
      viewerOptions: this.iframe.contentWindow?.PDFViewerApplicationOptions
    }
  }
}

export interface IframeWindow extends Window {
  PDFViewerApplication?: PdfViewerApplication
  PDFViewerApplicationOptions: PdfViewerApplicationOptions
}

export interface PdfjsViewerElementIframe extends HTMLIFrameElement {
  contentWindow: IframeWindow
}

export interface InitializationData {
  viewerApp?: PdfViewerApplication
}

export default PdfjsViewerElement

if (!window.customElements.get('pdfjs-viewer-element')) {
  window.customElements.define('pdfjs-viewer-element', PdfjsViewerElement)
}