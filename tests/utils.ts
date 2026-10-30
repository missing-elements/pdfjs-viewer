import { PdfjsViewerElementIframe, IframeWindow } from "../src/pdfjs-viewer-element"

type TestViewerElement = HTMLElement & {
  iframe: PdfjsViewerElementIframe
  initPromise: Promise<{ viewerApp?: IframeWindow['PDFViewerApplication'] }>
}

export const getIframe = (): PdfjsViewerElementIframe => {
  return (document.body.querySelector('pdfjs-viewer-element') as TestViewerElement)?.iframe
}

export const getViewerElement = (element = '#outerContainer'): HTMLElement | null | undefined => {
  return getIframe()?.contentDocument?.querySelector(element)
}

export const mountViewer = async (template: string) => {
  document.body.innerHTML = ''
  document.body.innerHTML = template

  const viewer = document.body.querySelector('pdfjs-viewer-element') as TestViewerElement
  const { viewerApp } = await viewer.initPromise
  return viewerApp
}

// Mounts the viewer in a frame with its own page CSP, which the viewer's srcdoc iframe inherits as
// it would a host page's. The frame is written with `document.write`, which gives it this page's
// URL; under `about:srcdoc` the dev build's runtime file URLs fail to resolve. Vitest routes the
// element's dynamic imports through `__vitest_browser_runner__`, which only the test page defines,
// so the frame gets the pass-through stub Vitest gives workers.
export const mountViewerWithPageCsp = async (csp: string, template: string) => {
  document.body.innerHTML = ''
  const frame = document.createElement('iframe')
  document.body.append(frame)
  const doc = frame.contentDocument!
  doc.open()
  doc.write(`
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <script>globalThis.__vitest_browser_runner__ = { wrapDynamicImport: (f) => f() }</script>
    <script type="module" src="/src/pdfjs-viewer-element.ts"></script>
    ${template}`)
  doc.close()

  await frame.contentWindow!.customElements.whenDefined('pdfjs-viewer-element')
  const viewer = doc.querySelector('pdfjs-viewer-element') as TestViewerElement
  await viewer.initPromise
  return viewer
}

export const getFileData = () => {
  const baseStr =
    'JVBERi0xLjcKCjEgMCBvYmogICUgZW50cnkgcG9pbnQKPDwKICAvVHlwZSAvQ2F0YWxvZwog' +
    'IC9QYWdlcyAyIDAgUgo+PgplbmRvYmoKCjIgMCBvYmoKPDwKICAvVHlwZSAvUGFnZXMKICAv' +
    'TWVkaWFCb3ggWyAwIDAgMjAwIDIwMCBdCiAgL0NvdW50IDEKICAvS2lkcyBbIDMgMCBSIF0K' +
    'Pj4KZW5kb2JqCgozIDAgb2JqCjw8CiAgL1R5cGUgL1BhZ2UKICAvUGFyZW50IDIgMCBSCiAg' +
    'L1Jlc291cmNlcyA8PAogICAgL0ZvbnQgPDwKICAgICAgL0YxIDQgMCBSIAogICAgPj4KICA+' +
    'PgogIC9Db250ZW50cyA1IDAgUgo+PgplbmRvYmoKCjQgMCBvYmoKPDwKICAvVHlwZSAvRm9u' +
    'dAogIC9TdWJ0eXBlIC9UeXBlMQogIC9CYXNlRm9udCAvVGltZXMtUm9tYW4KPj4KZW5kb2Jq' +
    'Cgo1IDAgb2JqICAlIHBhZ2UgY29udGVudAo8PAogIC9MZW5ndGggNDQKPj4Kc3RyZWFtCkJU' +
    'CjcwIDUwIFRECi9GMSAxMiBUZgooSGVsbG8sIHdvcmxkISkgVGoKRVQKZW5kc3RyZWFtCmVu' +
    'ZG9iagoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDEwIDAwMDAwIG4g' +
    'CjAwMDAwMDAwNzkgMDAwMDAgbiAKMDAwMDAwMDE3MyAwMDAwMCBuIAowMDAwMDAwMzAxIDAw' +
    'MDAwIG4gCjAwMDAwMDAzODAgMDAwMDAgbiAKdHJhaWxlcgo8PAogIC9TaXplIDYKICAvUm9v' +
    'dCAxIDAgUgo+PgpzdGFydHhyZWYKNDkyCiUlRU9G'

  return fetch(baseStr)
    .then(b => b.arrayBuffer())
    .then(buff => new Uint8Array(buff))
}