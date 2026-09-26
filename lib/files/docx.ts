/**
 * `.docx` via mammoth — parsed in the browser, never uploaded.
 *
 * `extractRawText` rather than `convertToHtml`: the prompt wants the document's
 * words, and HTML would put markup into the reference block that the model then
 * has to see past. The cost is that structure is flattened — headings, tables and
 * lists all arrive as plain paragraphs, while `prompts/office.md` asks the agent
 * to describe 「大致结构」. The prompt's own escape hatch covers it (「如果…格式导致
 * 内容丢失，直接告诉用户」), and handing over markup would trade a visible
 * limitation for an invisible one.
 *
 * mammoth is CommonJS with a `browser` field remapping its two Node-only modules.
 * That resolves to the namespace object here rather than a default, so both
 * shapes are accepted — the bundler decides which one arrives, and guessing wrong
 * would be an unhelpful `extractRawText is not a function`.
 */

import { fileUnreadableError } from "@/lib/llm/errors";

interface MammothModule {
  extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }>;
}

export async function parseDocxFile(file: File): Promise<string> {
  // Imported here, not at module scope: nothing loads mammoth until a .docx is
  // actually attached, so the 460 KB chunk stays out of every other page.
  const imported = (await import("mammoth")) as unknown as MammothModule & { default?: MammothModule };
  const mammoth = imported.default ?? imported;

  if (typeof mammoth.extractRawText !== "function") {
    throw fileUnreadableError(file.name, "mammoth module did not expose extractRawText");
  }

  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });

  // `result.messages` — mammoth's own warnings, e.g. an unsupported style — is
  // deliberately dropped rather than plumbed through. It has no consumer: the
  // chip shows the character count or a refusal, and a field nothing reads is a
  // comment claiming a behaviour that does not exist. If one is ever wanted, the
  // rule is that the document's text must never be copied into it.
  return result.value;
}
