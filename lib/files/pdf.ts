/**
 * `.pdf` via pdf.js — parsed in the browser, never uploaded.
 *
 * Two things about pdf.js are load-bearing and neither is obvious:
 *
 *   1. **The worker URL.** pdf.js builds it as a *module* worker from a string we
 *      supply, and `GlobalWorkerOptions.workerSrc` throws when unset. The asset
 *      build copies the worker into `public/pdf/` and the URL is assembled from
 *      `NEXT_PUBLIC_BASE_PATH` by hand, because a static export has no server to
 *      rewrite it and `basePath` does not apply itself to a URL we write.
 *
 *   2. **A successful parse is not evidence the worker loaded.** When worker
 *      construction fails, pdf.js catches it, calls `#setupFakeWorker()`, and
 *      `await import()`s the worker on the main thread — so parsing still
 *      succeeds and a broken worker URL is indistinguishable from a working one
 *      from the outside. The only reliable evidence is a Network entry for the
 *      worker and **no** "Setting up fake worker" console warning. That check is
 *      written into E8 rather than left to intuition.
 *
 * Text extraction never decodes images, so a scanned PDF does not fail here — it
 * returns almost nothing, which is why the emptiness check lives in `parse.ts`
 * and is a refusal rather than a silent success (E9).
 */

import { PDF_CMAPS_PUBLIC_PATH, PDF_WORKER_PUBLIC_PATH } from "@/lib/files/vendor";

/**
 * Same reasoning as `lib/rag/retriever.ts`: GitHub Pages serves a project site
 * from a subpath, and CI sets this to the repository name. Empty in local dev.
 */
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * Structural, and deliberately not imported from pdfjs-dist's own types: those
 * live behind a version-specific deep path (`types/src/display/api`), and a
 * type-only import that breaks on a patch bump is a build failure with no
 * runtime symptom to explain it. `TextMarkedContent` has no `str`, which is the
 * only distinction this code cares about.
 */
interface PdfTextItem {
  str?: string;
  hasEOL?: boolean;
}

/**
 * Joins one page's text items.
 *
 * pdf.js splits a line into items wherever the PDF's typesetting did, and does
 * not tell you where the spaces were. Concatenating raw is right for Chinese —
 * one item per glyph, and space-joining would put a gap between every character —
 * but wrong for Latin, where "Hello" and "World" can be two adjacent items with
 * no separator. So a space is inserted only between two ASCII alphanumerics,
 * which cannot fire inside a CJK run.
 */
function itemsToText(items: PdfTextItem[]): string {
  let out = "";

  for (const item of items) {
    if (typeof item.str !== "string") continue;

    if (item.str !== "") {
      const previous = out.slice(-1);
      const next = item.str.slice(0, 1);
      if (/[A-Za-z0-9]/.test(previous) && /[A-Za-z0-9]/.test(next)) out += " ";
      out += item.str;
    }

    if (item.hasEOL) out += "\n";
  }

  return out;
}

export async function parsePdfFile(file: File): Promise<string> {
  // Imported here rather than at module scope: 433 KB fetched when a PDF is
  // actually attached, and never on a page that has no PDF.
  const pdfjs = await import("pdfjs-dist");

  pdfjs.GlobalWorkerOptions.workerSrc = `${BASE_PATH}/${PDF_WORKER_PUBLIC_PATH}`;

  const data = new Uint8Array(await file.arrayBuffer());

  const task = pdfjs.getDocument({
    data,
    // CJK PDFs routinely need a cMap. Missing one throws rather than producing
    // mojibake, but a throw here would look like a corrupt file, so they ship.
    cMapUrl: `${BASE_PATH}/${PDF_CMAPS_PUBLIC_PATH}`,
    cMapPacked: true,
  });

  const doc = await task.promise;

  try {
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(itemsToText(content.items as PdfTextItem[]));
    }
    // Page breaks become blank lines, which is what `normalizeText` collapses to
    // a paragraph boundary — so a page's last sentence and the next page's first
    // are never joined into one line.
    return pages.join("\n\n");
  } finally {
    // **On the task, not on the document.** `PDFDocumentLoadingTask.destroy()`
    // is the documented "abort all network requests and destroy the worker"
    // (pdfjs-dist 6.3.289, types/src/display/api.d.ts:860); `PDFDocumentProxy`
    // has no `destroy` at all. Without this a session that attaches several PDFs
    // keeps every one of their buffers resident.
    await task.destroy();
  }
}
