/**
 * The dispatcher — `File` in, `Upload` out. docs/02_TECH_SPEC.md §8.7
 *
 * The order of the checks is the requirement, not an implementation detail:
 *
 *   1. **Size, against `file.size`, before anything reads the file.** E10 says an
 *      oversized file is "refused with a clear message before parsing", and a
 *      10 MiB read that is then discarded is exactly what that criterion forbids.
 *   2. **Format, before the read.** Same reason, and it means an unsupported file
 *      costs nothing.
 *   3. Only then parse.
 *
 * Everything user-facing comes from `lib/llm/errors.ts`; this module decides
 * which refusal applies and never words one itself.
 */

import {
  fileFormatUnsupportedError,
  fileNoTextError,
  fileTooLargeError,
  fileUnreadableError,
  isAppError,
} from "@/lib/llm/errors";
import { parseDocxFile } from "@/lib/files/docx";
import { parsePdfFile } from "@/lib/files/pdf";
import { parseTextFile } from "@/lib/files/text";
import { ACCEPTED_LABEL, checkSize, detectFormat, INLINE_BUDGET_CHARS, MIN_EXTRACTED_CHARS } from "@/lib/files/limits";
import { normalizeText, prepareText } from "@/lib/files/prepare";
import type { Upload } from "@/lib/files/types";
import { countChars } from "@/lib/rag/chunk";

/**
 * `File.name` is a basename by specification, but it is still user-controlled and
 * ends up in the prompt's attribution line and in a React key. Stripping path
 * separators and control characters costs nothing and removes a class of surprise
 * — including a filename that renders as several lines in the middle of the
 * reference block.
 */
function displayName(raw: string): string {
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[/\\]/g, "")
    .trim();
  return cleaned === "" ? "未命名文件" : cleaned;
}

export async function prepareUpload(file: File, agentId: string, key: string): Promise<Upload> {
  const name = displayName(file.name);
  const base: Pick<Upload, "key" | "name" | "size"> = { key, name, size: file.size };

  const size = checkSize(file.size);
  if (!size.ok) {
    return { ...base, status: { kind: "failed", error: fileTooLargeError(name, size.actual, size.limit) } };
  }

  const format = detectFormat(file.name);
  if (format === null) {
    return { ...base, status: { kind: "failed", error: fileFormatUnsupportedError(name, ACCEPTED_LABEL) } };
  }

  let raw: string;

  try {
    if (format === "pdf") {
      raw = await parsePdfFile(file);
    } else if (format === "docx") {
      raw = await parseDocxFile(file);
    } else {
      raw = await parseTextFile(file);
    }
  } catch (err) {
    // A parser that already produced a typed refusal keeps it (mammoth's
    // missing-function guard). Anything else is a corrupt or mislabelled file.
    if (isAppError(err)) return { ...base, status: { kind: "failed", error: err } };
    return {
      ...base,
      status: { kind: "failed", error: fileUnreadableError(name, err instanceof Error ? err.message : String(err)) },
    };
  }

  const text = normalizeText(raw);

  // E9. An image-only PDF extracts to nothing and must say so — `01_PRD.md` §6:
  // "do not silently return nothing". The threshold is not zero because a scan
  // often yields a stray page number, and "3 characters" is not a document.
  if (countChars(text) < MIN_EXTRACTED_CHARS) {
    return { ...base, status: { kind: "failed", error: fileNoTextError(name) } };
  }

  const prepared = prepareText({ text, fileName: name, agentId, idPrefix: `ul:${key}`, budget: INLINE_BUDGET_CHARS });

  return {
    ...base,
    status: {
      kind: "ready",
      chars: prepared.chars,
      inlineChars: prepared.inlineChars,
      truncated: prepared.truncated,
      document: prepared.document,
      tail: prepared.tail,
    },
  };
}
