/**
 * Chunking and frontmatter parsing — docs/02_TECH_SPEC.md §8.1, §8.2
 *
 * Shared by `scripts/build-assets.mts` (Node, at build time) and by the runtime
 * (browser, for uploaded files). Keeping one implementation is the point: if the
 * build chunked differently from the runtime, a chunk would retrieve differently
 * depending on where it came from, and nobody would notice for a long time.
 *
 * Therefore: pure functions only. No `node:fs`, no `crypto`, no DOM.
 *
 * NOTE: this file is imported by a script run under Node's
 * `--experimental-strip-types`, which only erases types — it does not transform.
 * So no `enum`, no `namespace`, and no constructor parameter properties.
 */

export interface KnowledgeFrontmatter {
  title: string;
  tags: string[];
  updated: string;
}

export interface Chunk {
  id: string;
  agentId: string;
  /** Includes the `title — heading` prefix. This is what the model sees. */
  text: string;
  /** Repo-relative source path, e.g. `knowledge/office/meeting-summary.md`. */
  source: string;
  heading: string;
  title: string;
  tags: string[];
}

/**
 * Section length guidance, in non-whitespace characters.
 *
 * `MIN`/`MAX` are the spec's 200–500 band. Missing the band is a warning, not a
 * failure — a 190-character section is a style problem, and failing the build
 * for it would block work on something cosmetic. `HARD_MAX` is different: a
 * section that large is a structural problem, and the fix is to split it.
 */
export const SECTION_MIN = 200;
export const SECTION_MAX = 500;
export const SECTION_HARD_MAX = 1500;

/**
 * A build failure with a file and, when known, a line.
 *
 * Acceptance criterion A4 requires the build to stop with a file-and-line
 * message rather than emitting a silently empty index.
 */
export class AssetError extends Error {
  file: string;
  line: number | undefined;

  constructor(message: string, file: string, line?: number) {
    super(line === undefined ? `${file}: ${message}` : `${file}:${line}: ${message}`);
    this.name = "AssetError";
    this.file = file;
    this.line = line;
  }
}

/** Counts non-whitespace characters — a workable proxy for the spec's "characters". */
export function countChars(text: string): number {
  return text.replace(/\s/g, "").length;
}

function normalize(raw: string): string {
  return raw.replace(/^﻿/, "").replace(/\r\n/g, "\n");
}

const REQUIRED_KEYS = ["title", "tags", "updated"];

export interface ParsedFile {
  data: KnowledgeFrontmatter;
  body: string;
  /** 1-based line number where `body` starts, for error reporting. */
  bodyStartLine: number;
}

/**
 * Parses the YAML frontmatter of a knowledge file.
 *
 * Deliberately not a general YAML parser. The format is fixed and authored in
 * this repository, so the useful behaviour is to reject anything unexpected
 * loudly — which is exactly what A4 asks for. A permissive parser would accept
 * `titel:` and produce a chunk with an empty title.
 */
export function parseFrontmatter(raw: string, file: string): ParsedFile {
  const lines = normalize(raw).split("\n");

  if (lines[0]?.trim() !== "---") {
    throw new AssetError(
      'missing frontmatter — the file must begin with a "---" line',
      file,
      1,
    );
  }

  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === "---") {
      close = i;
      break;
    }
  }
  if (close === -1) {
    throw new AssetError('unterminated frontmatter — no closing "---"', file, 1);
  }

  const found: Record<string, string> = {};
  let openListKey: string | null = null;
  const listItems: Record<string, string[]> = {};

  for (let i = 1; i < close; i++) {
    const line = lines[i] ?? "";
    const lineNo = i + 1;

    if (line.trim() === "") continue;

    // Block list item: "  - value"
    const itemMatch = /^\s+-\s+(.*)$/.exec(line);
    if (itemMatch && openListKey) {
      const value = itemMatch[1]?.trim() ?? "";
      (listItems[openListKey] ??= []).push(unquote(value));
      continue;
    }

    const kvMatch = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (!kvMatch) {
      throw new AssetError(`cannot parse frontmatter line: ${JSON.stringify(line)}`, file, lineNo);
    }

    const key = kvMatch[1] as string;
    const value = (kvMatch[2] ?? "").trim();

    if (!REQUIRED_KEYS.includes(key)) {
      throw new AssetError(
        `unexpected frontmatter key "${key}" — allowed keys are ${REQUIRED_KEYS.join(", ")}`,
        file,
        lineNo,
      );
    }

    if (key === "tags") {
      if (value === "") {
        // Block form follows on subsequent indented lines.
        openListKey = "tags";
        listItems["tags"] = [];
        found["tags"] = "";
        continue;
      }
      const arrayMatch = /^\[(.*)\]$/.exec(value);
      if (!arrayMatch) {
        throw new AssetError(
          'tags must be an inline array ("tags: [a, b]") or a block list',
          file,
          lineNo,
        );
      }
      const inner = arrayMatch[1]?.trim() ?? "";
      listItems["tags"] = inner === "" ? [] : inner.split(",").map((t) => unquote(t.trim())).filter((t) => t !== "");
      found["tags"] = "parsed";
      continue;
    }

    openListKey = null;
    found[key] = unquote(value);
  }

  for (const key of REQUIRED_KEYS) {
    if (!(key in found)) {
      throw new AssetError(`frontmatter is missing required key "${key}"`, file, 1);
    }
  }

  const title = (found["title"] ?? "").trim();
  if (title === "") {
    throw new AssetError('frontmatter "title" is empty', file, 1);
  }

  const updated = (found["updated"] ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(updated)) {
    throw new AssetError(
      `frontmatter "updated" must be YYYY-MM-DD, found ${JSON.stringify(updated)}`,
      file,
      1,
    );
  }

  const tags = listItems["tags"] ?? [];
  if (tags.length === 0) {
    throw new AssetError(
      'frontmatter "tags" is empty — tags are indexed at double weight (§8.3)',
      file,
      1,
    );
  }

  const bodyLines = lines.slice(close + 1);
  return {
    data: { title, tags, updated },
    body: bodyLines.join("\n").trim(),
    bodyStartLine: close + 2,
  };
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

interface Section {
  heading: string;
  body: string;
}

/** Splits a body on `## ` headings. Content before the first heading is dropped. */
function splitSections(body: string): Section[] {
  const lines = body.split("\n");
  const sections: Section[] = [];
  let heading: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (heading !== null) {
      sections.push({ heading, body: buffer.join("\n").trim() });
    }
    buffer = [];
  };

  for (const line of lines) {
    const match = /^##\s+(.*)$/.exec(line);
    if (match) {
      flush();
      heading = (match[1] ?? "").trim();
      continue;
    }
    if (heading !== null) buffer.push(line);
  }
  flush();

  return sections.filter((s) => s.heading !== "");
}

/**
 * Splits an oversized section on paragraph boundaries.
 *
 * Only used when a section exceeds SECTION_HARD_MAX. Small sections are left
 * whole even when they contain multiple paragraphs, because a chunk is meant to
 * be one coherent idea and splitting early costs retrieval precision.
 */
function splitLongBody(body: string): string[] {
  if (countChars(body) <= SECTION_HARD_MAX) return [body];

  const paragraphs = body.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p !== "");
  const parts: string[] = [];
  let current: string[] = [];

  for (const paragraph of paragraphs) {
    const candidate = [...current, paragraph].join("\n\n");
    if (current.length > 0 && countChars(candidate) > SECTION_MAX) {
      parts.push(current.join("\n\n"));
      current = [paragraph];
    } else {
      current.push(paragraph);
    }
  }
  if (current.length > 0) parts.push(current.join("\n\n"));

  return parts;
}

export interface ChunkOptions {
  raw: string;
  /** Repo-relative path, stored on every chunk as `source`. */
  file: string;
  agentId: string;
}

export interface ChunkResult {
  title: string;
  tags: string[];
  updated: string;
  chunks: Chunk[];
  /** Non-fatal problems, reported by the build without failing it. */
  warnings: string[];
}

/**
 * Turns one knowledge file into chunks.
 *
 * Every chunk's text is prefixed with `title — heading` (§8.2 step 2). A
 * retrieved fragment with no context is close to useless to the model: it
 * arrives with no indication of what document it came from or what it is about.
 */
export function chunkKnowledgeFile(options: ChunkOptions): ChunkResult {
  const { raw, file, agentId } = options;
  const parsed = parseFrontmatter(raw, file);
  const { title, tags, updated } = parsed.data;

  const sections = splitSections(parsed.body);
  if (sections.length === 0) {
    throw new AssetError('no "## " sections found — nothing would be retrievable', file, parsed.bodyStartLine);
  }

  const chunks: Chunk[] = [];
  const warnings: string[] = [];
  const base = file.replace(/^.*\//, "").replace(/\.md$/, "");

  for (const section of sections) {
    const size = countChars(section.body);
    if (size < SECTION_MIN || size > SECTION_MAX) {
      warnings.push(`${file} §${section.heading} — ${size} chars, outside the ${SECTION_MIN}–${SECTION_MAX} band`);
    }
    if (section.body === "") {
      throw new AssetError(`section "${section.heading}" has no content`, file);
    }

    const parts = splitLongBody(section.body);
    parts.forEach((part, i) => {
      const suffix = parts.length > 1 ? ` (${i + 1}/${parts.length})` : "";
      chunks.push({
        id: `${agentId}:${base}:${chunks.length}`,
        agentId,
        text: `${title} — ${section.heading}${suffix}\n\n${part}`,
        source: file,
        heading: section.heading,
        title,
        tags,
      });
    });
  }

  return { title, tags, updated, chunks, warnings };
}

/**
 * Extracts the model-facing prompt from a `prompts/<id>.md` source file.
 *
 * Everything before the first `## ` heading is treated as human-facing metadata
 * (the title, the placement note, the safety-policy warning) and is stripped.
 * One rule, applied uniformly, so no file needs a special case.
 */
export function extractPromptBody(raw: string, file: string): string {
  const normalized = normalize(raw);
  const match = /^##\s/m.exec(normalized);
  if (!match || match.index === undefined) {
    throw new AssetError(
      'no "## " heading found — the prompt body starts at the first "## " line',
      file,
      1,
    );
  }
  const body = normalized.slice(match.index).trim();
  if (body === "") {
    throw new AssetError("prompt body is empty", file);
  }
  return body;
}
