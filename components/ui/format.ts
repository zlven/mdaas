/**
 * `8,412` — the wireframe's form. Grouped, because six-digit counts get read.
 *
 * Extracted from `AttachmentChips` when the 资料夹 started printing the same
 * numbers. A saved document's character count is the *same quantity* as an
 * attachment's — the chip and the folder are two views of one parse — so they
 * cannot be allowed to format it differently. Two copies of one format string are
 * identical right up until one of them is edited, which is the argument
 * `components/ui/field.ts` already makes for the form-control classes.
 *
 * `"zh-CN"` and not the runtime's default locale: the product's copy is Chinese,
 * and a browser set to another locale would group by its own conventions.
 *
 * This does not contradict the rule that a *tool's* output is not grouped
 * (`1200 元`, not `¥ 1,200`, `docs/03_UI_UX_SPEC.md`). A tool's numbers are the
 * user's own data, and re-formatting them is the product's opinion about data it
 * does not own. A character count is the opposite: it is this product's own
 * measurement of a file it read, and it is formatted the way this product
 * formats measurements everywhere.
 */
export function formatChars(chars: number): string {
  return chars.toLocaleString("zh-CN");
}
