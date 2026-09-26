/**
 * pdf.js asset locations — docs/02_TECH_SPEC.md §4, §8.7
 *
 * The worker and the cMap tables are copied into `public/pdf/` by
 * `scripts/build-assets.mts` rather than resolved through the bundler, because
 * pdf.js constructs its worker as a *module* worker from a URL we hand it:
 *
 *     new Worker(workerSrc, { type: "module" })
 *
 * so the URL has to be correct at runtime, in a static export, under whatever
 * `basePath` the site is deployed to. `lib/rag/retriever.ts` builds its knowledge
 * URL by hand for exactly the same reason — Next rewrites the asset URLs it knows
 * about, and does not rewrite one we write ourselves.
 *
 * Imported by both the browser and the build script, so it must obey the same
 * constraint as `lib/rag/chunk.ts`: strings only, no DOM, no `node:fs`, and —
 * because the build script runs under `--experimental-strip-types`, which erases
 * types rather than transforming them — no `enum`, no `namespace`, and no
 * constructor parameter properties.
 */

/**
 * Must equal the installed `pdfjs-dist` version. The build fails on a mismatch.
 *
 * The worker, the cMap directory and the `cMapUrl` contract are all
 * version-coupled to the API bundle: pdfjs-dist is pinned exactly (not with a
 * caret) precisely so a minor bump cannot ship a worker that does not match the
 * code calling it. A mismatch here is a build failure rather than a runtime 404
 * in the middle of a user's PDF.
 */
export const PDFJS_VERSION = "6.3.289";

/** Path under `public/`, and therefore under `basePath` once deployed. */
export const PDF_WORKER_PUBLIC_PATH = "pdf/pdf.worker.min.mjs";

/** Where the asset build reads it from. */
export const PDF_WORKER_SOURCE = "node_modules/pdfjs-dist/build/pdf.worker.min.mjs";

/**
 * cMaps map character codes to Unicode for PDFs that use a non-standard
 * encoding — CJK documents routinely need one, which makes shipping these
 * non-optional for a Chinese-language product.
 *
 * The trailing slash is required: pdf.js concatenates the map name onto this
 * string. A missing cMap *throws* (`Ensure that the cMapUrl API parameter is
 * provided`) rather than producing mojibake, so a packaging mistake here is
 * loud, not silent.
 */
export const PDF_CMAPS_PUBLIC_PATH = "pdf/cmaps/";
export const PDF_CMAPS_SOURCE = "node_modules/pdfjs-dist/cmaps";
