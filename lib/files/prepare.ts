/**
 * Turning parsed text into prompt material — docs/02_TECH_SPEC.md §8.7
 *
 * Pure functions over strings, so the whole budget and truncation story is
 * verifiable from Node without a browser (§8.7 is the requirement, and E9/E10 are
 * the acceptance criteria for its refusal paths).
 *
 * The chunker here is deliberately **not** `chunkKnowledgeFile`. That one parses
 * YAML frontmatter and splits on `## ` headings, and a raw transcript has
 * neither — it would throw on the first call. Uploads keep the same `Chunk`
 * shape and the same size band, but split on blank lines, which is what a plain
 * document actually has.
 */

import { countChars, SECTION_HARD_MAX, SECTION_MAX, type Chunk } from "@/lib/rag/chunk";

/**
 * Normalises extracted text before anything measures it.
 *
 * Every parser produces different line endings and spacing, and the character
 * count is shown to the user and compared against a budget — so it has to be
 * counted on the same normalised form the prompt will receive, or the chip would
 * report a number the prompt does not match.
 *
 * NFC because a PDF can emit decomposed accents, which would otherwise make two
 * visually identical documents count differently. Runs of three or more newlines
 * collapse to two so paragraph splitting still sees real boundaries.
 */
export function normalizeText(text: string): string {
  return text
    .normalize("NFC")
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface Injection {
  /** Injected verbatim. Equals the whole text when nothing was dropped. */
  inline: string;
  /** Everything after `inline`. Empty when not truncated. */
  tail: string;
  truncated: boolean;
}

/**
 * Splits `text` for injection, dropping as little as possible.
 *
 * **Invariant: `inline + tail === text`, always.** Nothing is dropped or
 * duplicated, which is what lets the truncation note state an exact character
 * count and lets the tail pool actually contain what the note says it does.
 *
 * The cut prefers a paragraph boundary so the model is not handed half a
 * sentence, but only when that boundary costs less than half the budget — a file
 * that is one enormous paragraph has a `\n\n` only at the very top, and honouring
 * it would inject almost nothing.
 */
export function splitForInjection(text: string, budget: number): Injection {
  if (countChars(text) <= budget) return { inline: text, tail: "", truncated: false };

  // Walk to the index just past the budget-th non-whitespace character.
  let seen = 0;
  let hard = text.length;
  for (let i = 0; i < text.length; i++) {
    if (!/\s/.test(text[i] ?? "")) {
      seen++;
      if (seen > budget) {
        hard = i;
        break;
      }
    }
  }

  const slice = text.slice(0, hard);
  const boundary = slice.lastIndexOf("\n\n");
  const cut = boundary > 0 && countChars(slice.slice(0, boundary)) >= budget / 2 ? boundary : hard;

  return { inline: text.slice(0, cut), tail: text.slice(cut), truncated: true };
}

/**
 * Groups paragraphs up to `SECTION_MAX`, then hard-splits anything still over
 * `SECTION_HARD_MAX`.
 *
 * The second pass is not redundant: a transcript with no blank lines at all is a
 * single paragraph, and without it a 3 MB file would become one chunk whose
 * length swamps BM25's length normalisation for every other chunk in the index.
 */
function groupParagraphs(text: string): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter((part) => part !== "");

  const grouped: string[] = [];
  let buffer = "";

  for (const paragraph of paragraphs) {
    if (buffer === "") {
      buffer = paragraph;
    } else if (countChars(buffer) + countChars(paragraph) <= SECTION_MAX) {
      buffer = `${buffer}\n\n${paragraph}`;
    } else {
      grouped.push(buffer);
      buffer = paragraph;
    }
  }
  if (buffer !== "") grouped.push(buffer);

  return grouped.flatMap(splitOversized);
}

function splitOversized(part: string): string[] {
  if (countChars(part) <= SECTION_HARD_MAX) return [part];

  const pieces: string[] = [];
  let buffer = "";
  let seen = 0;

  const push = (line: string): void => {
    const size = countChars(line);
    if (seen + size > SECTION_MAX && buffer !== "") {
      pieces.push(buffer);
      buffer = line;
      seen = size;
    } else {
      buffer = buffer === "" ? line : `${buffer}\n${line}`;
      seen += size;
    }
  };

  for (const line of part.split("\n")) {
    // **A single line can itself be over the band, and grouping by line does not
    // help there.** Two real cases: a `.txt` that is one enormous paragraph, and
    // a PDF page whose text items carried no end-of-line marker — `itemsToText`
    // emits a newline only on `hasEOL`, so a whole page arrives as one line.
    // Without this the loop below pushed it through whole and the file became a
    // single 5,000-character chunk, which is exactly what the comment above
    // `splitOversized` promises does not happen.
    //
    // The cut is at `SECTION_MAX` *raw* characters, which bounds the result by
    // construction: `countChars` ignores whitespace, so the counted size can only
    // come out smaller than the slice.
    for (let i = 0; i < line.length; i += SECTION_MAX) {
      push(line.slice(i, i + SECTION_MAX));
    }
  }

  if (buffer !== "") pieces.push(buffer);
  return pieces;
}

export interface PreparedText {
  /** The one chunk injected verbatim, with the truncation note appended. */
  document: Chunk;
  /** The overflow, for the session's retrieval pool. Empty when not truncated. */
  tail: Chunk[];
  chars: number;
  /**
   * Non-whitespace characters actually injected. Equals `chars` when nothing was
   * dropped.
   *
   * Measured on `inline` rather than reported as the budget, because the two are
   * not the same number. The cut lands just past the budget-th character, and the
   * preference for a paragraph boundary can move it well below — so a note
   * reading "前 24,000 个字符" would be stating the cap while the model received
   * less. Both the note and the chip read this value, which is what keeps them
   * from disagreeing with each other or with the prompt.
   */
  inlineChars: number;
  truncated: boolean;
}

/**
 * Builds the prompt material for one parsed file.
 *
 * The truncation note is **written by us and appended to the injected text**,
 * because it is the only way the model can act on the instruction every prompt
 * already carries — `prompts/office.md` §8.2: 「文件内容可能不完整。如果文件明显被
 * 截断…直接告诉用户」. A model that cannot tell it was truncated will present a
 * partial read as a complete one, which is the failure that clause exists to stop.
 *
 * `idPrefix` keeps ids unique across two attachments that share a filename; ids
 * must not collide in the retrieval index or in React's keys.
 */
export function prepareText(options: {
  text: string;
  fileName: string;
  agentId: string;
  idPrefix: string;
  budget: number;
}): PreparedText {
  const { text, fileName, agentId, idPrefix, budget } = options;
  const chars = countChars(text);
  const { inline, tail, truncated } = splitForInjection(text, budget);
  const inlineChars = countChars(inline);

  const note = truncated
    ? `\n\n[已截断：以上是该文件的前 ${inlineChars} 个字符，原文共 ${chars} 个字符；其余内容已放入本次检索，可以继续提问。]`
    : "";

  const document: Chunk = {
    id: `${idPrefix}:0`,
    agentId,
    text: `${fileName}\n\n${inline}${note}`,
    // The filename, not a literal "upload" — this is the citation line
    // `formatContext` renders, and it must be what the user recognises.
    source: fileName,
    heading: fileName,
    title: fileName,
    tags: [],
  };

  const parts = truncated ? groupParagraphs(tail) : [];
  const tailChunks: Chunk[] = parts.map((part, i) => ({
    id: `${idPrefix}:${i + 1}`,
    agentId,
    text: `${fileName} — 续 ${i + 1}/${parts.length}\n\n${part}`,
    source: fileName,
    heading: `续 ${i + 1}/${parts.length}`,
    title: fileName,
    tags: [],
  }));

  return { document, tail: tailChunks, chars, inlineChars, truncated };
}
