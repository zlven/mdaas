"use client";

import { useState } from "react";

/**
 * Markdown rendering for assistant messages — docs/01_PRD.md §5,
 * docs/03_UI_UX_SPEC.md §5.
 *
 * Hand-written rather than pulled from a package, on the dependency policy in
 * 02_TECH_SPEC.md §2 ("prefer ~100 lines of clear local code over a package")
 * and because the landing experience is the product argument: a remark/micromark
 * chain is a large amount of JavaScript to ship for six block types.
 *
 * The supported subset is exactly the PRD's list — headings, lists, tables,
 * blockquotes, inline code, fenced code — plus bold, italic and links.
 *
 * Two deliberate choices:
 *
 *   - **No `dangerouslySetInnerHTML`.** Model output is untrusted (§8.6), and
 *     this is the one place it would be tempting. Everything below builds React
 *     elements, so a message containing HTML renders as text.
 *   - **Links render as text plus the URL, not as a clickable anchor.** A model
 *     can emit any href, including `javascript:`. Showing the destination is both
 *     safe and more honest than a label a reader has to trust.
 */

type Block =
  | { kind: "code"; lang: string; body: string }
  | { kind: "heading"; level: number; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "rule" }
  | { kind: "p"; text: string };

const HEADING = /^(#{1,6})\s+(.*)$/;
const UL_ITEM = /^\s*[-*+]\s+(.*)$/;
const OL_ITEM = /^\s*\d+[.)]\s+(.*)$/;
const RULE = /^\s*([-*_])\1{2,}\s*$/;
const FENCE = /^\s*```(\S*)\s*$/;
const QUOTE = /^\s*>\s?(.*)$/;

function splitRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isDivider(line: string): boolean {
  return /^\s*\|?[\s:-]*-[\s|:-]*\|?\s*$/.test(line) && line.includes("-");
}

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    if (line.trim() === "") {
      i++;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i] ?? "")) {
        body.push(lines[i] ?? "");
        i++;
      }
      i++; // closing fence, or end of input
      blocks.push({ kind: "code", lang: fence[1] ?? "", body: body.join("\n") });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", level: (heading[1] ?? "#").length, text: heading[2] ?? "" });
      i++;
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ kind: "rule" });
      i++;
      continue;
    }

    // A table needs a header row plus a divider; without the divider it is just
    // a paragraph that happens to contain pipes.
    if (line.includes("|") && isDivider(lines[i + 1] ?? "")) {
      const head = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && (lines[i] ?? "").includes("|")) {
        rows.push(splitRow(lines[i] ?? ""));
        i++;
      }
      blocks.push({ kind: "table", head, rows });
      continue;
    }

    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i] ?? "")) {
        quoted.push(QUOTE.exec(lines[i] ?? "")?.[1] ?? "");
        i++;
      }
      blocks.push({ kind: "quote", text: quoted.join("\n") });
      continue;
    }

    if (UL_ITEM.test(line)) {
      const items: string[] = [];
      while (i < lines.length && UL_ITEM.test(lines[i] ?? "")) {
        items.push(UL_ITEM.exec(lines[i] ?? "")?.[1] ?? "");
        i++;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }

    if (OL_ITEM.test(line)) {
      const items: string[] = [];
      while (i < lines.length && OL_ITEM.test(lines[i] ?? "")) {
        items.push(OL_ITEM.exec(lines[i] ?? "")?.[1] ?? "");
        i++;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }

    const paragraph: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? "").trim() !== "" &&
      !HEADING.test(lines[i] ?? "") &&
      !FENCE.test(lines[i] ?? "") &&
      !UL_ITEM.test(lines[i] ?? "") &&
      !OL_ITEM.test(lines[i] ?? "") &&
      !QUOTE.test(lines[i] ?? "") &&
      !RULE.test(lines[i] ?? "")
    ) {
      paragraph.push(lines[i] ?? "");
      i++;
    }
    blocks.push({ kind: "p", text: paragraph.join("\n") });
  }

  return blocks;
}

/**
 * `**bold**`, `*italic*`, `` `code` ``, `[label](url)`. Applied left to right.
 *
 * The URL part allows one level of balanced parentheses. A naive `[^)]+` stops
 * at the first `)`, which mangles the very common
 * `https://en.wikipedia.org/wiki/Foo_(bar)` into a truncated URL plus an
 * orphaned `)`. One level covers real URLs; deeper nesting does not occur.
 */
const INLINE = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`|\[[^\]]+\]\((?:[^()\s]|\([^()\s]*\))+\))/g;

const LINK = /^\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)$/;

function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(INLINE);

  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part === "") return null;

    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={key} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={key} className="rounded-[var(--radius-sm)] bg-surface-alt px-1 py-0.5 font-mono text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      );
    }

    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }

    const link = LINK.exec(part);
    if (link) {
      return (
        <span key={key}>
          {link[1]}
          <span className="text-ink-subtle"> （{link[2]}）</span>
        </span>
      );
    }

    return <span key={key}>{part}</span>;
  });
}

function CodeBlock({ lang, body }: { lang: string; body: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied. Saying nothing is better than claiming
      // a copy that did not happen.
    }
  }

  return (
    <div className="my-4 overflow-hidden rounded-[var(--radius)] border border-line">
      <div className="flex items-center justify-between gap-4 border-b border-line bg-surface-alt px-3 py-1">
        <span className="font-mono text-micro text-ink-subtle">{lang === "" ? "代码" : lang}</span>
        <button
          type="button"
          onClick={copy}
          aria-label="复制这段代码"
          className="text-micro font-medium text-ink-muted transition-colors duration-150 ease-out hover:text-ink"
        >
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <pre className="overflow-x-auto bg-surface-alt p-4">
        <code className="font-mono text-small text-ink">{body}</code>
      </pre>
    </div>
  );
}

const HEADING_CLASS: Record<number, string> = {
  1: "text-h1 font-semibold mt-6 mb-3",
  2: "text-h2 font-semibold mt-6 mb-3",
  3: "text-h3 font-semibold mt-4 mb-2",
};

export function Markdown({ source }: { source: string }) {
  const blocks = parseBlocks(source);

  return (
    <>
      {blocks.map((block, index) => {
        const key = `b${index}`;

        switch (block.kind) {
          case "code":
            return <CodeBlock key={key} lang={block.lang} body={block.body} />;

          case "heading": {
            const level = Math.min(block.level, 3);
            const Tag = (level === 1 ? "h1" : level === 2 ? "h2" : "h3") as "h1" | "h2" | "h3";
            return (
              <Tag key={key} className={`${HEADING_CLASS[level] ?? HEADING_CLASS[3]} text-ink`}>
                {inline(block.text, key)}
              </Tag>
            );
          }

          case "ul":
            return (
              <ul key={key} className="my-3 list-disc space-y-1 pl-6">
                {block.items.map((item, n) => (
                  <li key={`${key}-${n}`}>{inline(item, `${key}-${n}`)}</li>
                ))}
              </ul>
            );

          case "ol":
            return (
              <ol key={key} className="my-3 list-decimal space-y-1 pl-6">
                {block.items.map((item, n) => (
                  <li key={`${key}-${n}`}>{inline(item, `${key}-${n}`)}</li>
                ))}
              </ol>
            );

          case "quote":
            return (
              <blockquote key={key} className="my-4 border-l-2 border-line-strong pl-4 text-ink-muted">
                {inline(block.text, key)}
              </blockquote>
            );

          case "table":
            // Horizontal scroll rather than wrapping: a wrapped table stops
            // being a table (03_UI_UX_SPEC.md §5).
            return (
              <div key={key} className="my-4 overflow-x-auto">
                <table className="w-full border-collapse text-small">
                  <thead>
                    <tr>
                      {block.head.map((cell, n) => (
                        <th key={`${key}-h${n}`} className="border border-line bg-surface-alt px-3 py-2 text-left font-semibold">
                          {inline(cell, `${key}-h${n}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={`${key}-r${r}`}>
                        {row.map((cell, c) => (
                          <td key={`${key}-r${r}c${c}`} className="border border-line px-3 py-2 align-top">
                            {inline(cell, `${key}-r${r}c${c}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );

          case "rule":
            return <hr key={key} className="my-6 border-line" />;

          case "p":
            return (
              <p key={key} className="my-3 whitespace-pre-wrap">
                {inline(block.text, key)}
              </p>
            );
        }
      })}
    </>
  );
}
