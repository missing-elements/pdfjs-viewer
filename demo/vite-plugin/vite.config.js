import { pdfjsViewerData } from '@missing-elements/pdfjs-viewer/vite'

// Copies the PDF.js data (WASM decoders, CMaps, fonts, ICC profiles, icons and the scripting
// sandbox) into the build output, next to the viewer files. Remove it to see the problem it solves.
export default {
  plugins: [pdfjsViewerData()]
}
