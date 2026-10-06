# Accessibility

`pdfjs-viewer-element` displays the bundled PDF.js viewer in an iframe. The
host application remains responsible for providing an accessible context for
the viewer and for supplying accessible PDF documents.

## Name the Viewer

Give every viewer instance a descriptive `iframe-title`. The title is exposed
to assistive technologies as the name of the embedded viewer. The component
uses `PDF viewer window` when no title is supplied, but a title that describes
the document or task is more useful.

```html
<pdfjs-viewer-element
  src="/reports/annual-report.pdf"
  iframe-title="Annual report 2026 PDF viewer"
  style="height: 100dvh">
</pdfjs-viewer-element>
```

The `iframe-title` attribute can be updated at runtime.

## Integrate Accessibly

- Give the element an explicit height so that its controls and document content
  remain usable.
- Provide a visible, programmatic label or heading in the surrounding page
  that explains the document and viewer's purpose.
- Ensure the viewer is reachable through the page's normal keyboard focus
  order. Test keyboard navigation in the context of the host application.
- Use the `locale` attribute when the viewer interface should match the
  application's language.
- If custom CSS is added with `injectViewerStyles`, preserve visible focus
  indicators, sufficient color contrast, and readable text.

## PDF Document Accessibility

Viewer accessibility cannot repair an inaccessible PDF. Authors should provide
documents with semantic structure, meaningful text alternatives, an appropriate
reading order, document language metadata, and sufficient contrast. Test the
complete experience with the assistive technologies and browsers used by the
application's audience.

## Scope

The viewer interface is provided by the bundled PDF.js version. This project
does not claim conformance with a specific accessibility standard for every
host application, PDF document, browser, or assistive technology combination.

To report an accessibility problem in the component, open an issue with the
browser, operating system, assistive technology (if applicable), component
version, PDF sample or reproducible steps, expected behavior, and actual
behavior. Do not include sensitive documents in a public issue.
