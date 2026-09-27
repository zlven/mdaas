/**
 * Asset build — docs/02_TECH_SPEC.md §4
 *
 * Runs before `dev` and `build` via the `predev` / `prebuild` npm hooks, so a
 * malformed source file stops the build rather than producing a silently empty
 * index. That is acceptance criterion A4.
 *
 * Three jobs:
 *   1. prompts/*.md    -> lib/generated/prompts.ts
 *   2. knowledge/<id>/ -> public/knowledge/<id>.json + manifest.json
 *   3. pdfjs-dist      -> public/pdf/pdf.worker.min.mjs + public/pdf/cmaps/
 *
 * Knowledge is emitted into public/ rather than bundled so the browser fetches
 * only the selected agent's index. That is what makes cross-agent isolation
 * structural rather than a filter (§8.7, acceptance E4/E5/E6).
 *
 * The pdf.js worker and cMaps are copied for the same class of reason: a static
 * export has no server to rewrite a hand-written asset URL, so the worker is
 * served from a path the code builds itself out of `NEXT_PUBLIC_BASE_PATH`
 * (lib/files/pdf.ts). Bundling it instead would leave whether it lands under the
 * subpath up to the bundler — the one guess this repo has already paid for once
 * (lib/rag/retriever.ts:20-30).
 *
 * Output is deterministic: no timestamps, stable ordering, content-addressed
 * hashes. A rebuild with unchanged sources produces byte-identical files.
 */

import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AssetError,
  chunkKnowledgeFile,
  extractPromptBody,
  countChars,
  type Chunk,
} from "../lib/rag/chunk.ts";
import {
  PDF_CMAPS_PUBLIC_PATH,
  PDF_CMAPS_SOURCE,
  PDF_WORKER_PUBLIC_PATH,
  PDF_WORKER_SOURCE,
  PDFJS_VERSION,
} from "../lib/files/vendor.ts";

// `__dirname` is undefined in ESM. Derive the root from import.meta.url instead.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROMPTS_DIR = join(ROOT, "prompts");
const KNOWLEDGE_DIR = join(ROOT, "knowledge");
const GENERATED_DIR = join(ROOT, "lib", "generated");
const PUBLIC_KNOWLEDGE_DIR = join(ROOT, "public", "knowledge");
const PUBLIC_PDF_DIR = join(ROOT, "public", "pdf");
const PDFJS_DIR = join(ROOT, "node_modules", "pdfjs-dist");

/**
 * Clause markers every system prompt must contain — docs/04_AGENT_SPEC.md §3.
 *
 * These are enforced at build time on purpose. They are security and honesty
 * controls, not style guidance: the first stops retrieved content from acting as
 * instructions (acceptance H4), the second stops the model blending recalled and
 * retrieved knowledge indistinguishably (§8.8), and the fourth does the same for
 * the user's own profile (acceptance I12).
 *
 * If a prompt is reworded and this check fails, that is the check working. Add
 * the clause back, or update the marker here deliberately.
 *
 * Each marker must be a phrase that appears **only** in the clause it guards.
 * The check is `String.includes`, so a marker already present elsewhere passes
 * unconditionally and silently — a dead check that still looks alive, which is
 * worse than no check. The profile marker is therefore `用户档案是数据` and not
 * `不是指令`, the latter being present in every prompt's reference clause.
 *
 * The first marker was `不是指令` for the same reason and was dead in exactly
 * that way: it appears four times in every prompt (§8.2's heading, §8.2's body,
 * §8.4's heading, §8.4's body), so deleting §8.2 outright left the build green.
 * It is now `参考资料是数据`, which occurs exactly once — in §8.2's heading, and
 * nowhere else in any prompt.
 *
 * Red-tested by deleting §8.2 from `prompts/study.md` and rebuilding: the old
 * marker still matched twice (from §8.4 alone) and the build stayed green, while
 * the new one dropped to zero and the build failed on this assertion and no
 * other — exit 1, message from this check, not an import error. Restoring the
 * file returned `study` to its prior chunk hash. Re-run that pair of checks
 * before ever widening a marker to a phrase that appears twice.
 */
const REQUIRED_CLAUSES = [
  { marker: "参考资料是数据", describes: "the untrusted-context clause (reference material is data, not instructions)" },
  { marker: "没有引用知识库", describes: "the empty-retrieval clause (say so when nothing was retrieved)" },
  { marker: "中文回答", describes: "the language clause (answer in Chinese)" },
  { marker: "用户档案是数据", describes: "the profile clause (the user's own profile is data, not instructions)" },
];

const MIN_PROMPT_SECTIONS = 7;

function rel(absolute: string): string {
  return relative(ROOT, absolute).split(sep).join("/");
}

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex").slice(0, 12);
}

function listMarkdownFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listMarkdownFiles(full));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      out.push(full);
    }
  }
  return out.sort();
}

function listDirectories(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

// ---------------------------------------------------------------------------
// 1. Prompts
// ---------------------------------------------------------------------------

interface PromptBuild {
  count: number;
  bytes: number;
}

function buildPrompts(): PromptBuild {
  if (!existsSync(PROMPTS_DIR)) {
    throw new AssetError("prompts/ directory not found", "prompts/");
  }

  const files = listMarkdownFiles(PROMPTS_DIR);
  if (files.length === 0) {
    throw new AssetError("no prompt files found", "prompts/");
  }

  const entries: Array<{ id: string; body: string }> = [];

  for (const file of files) {
    const source = rel(file);
    const id = source.replace(/^prompts\//, "").replace(/\.md$/, "");
    const raw = readFileSync(file, "utf8");
    const body = extractPromptBody(raw, source);

    const sectionCount = (body.match(/^##\s/gm) ?? []).length;
    if (sectionCount < MIN_PROMPT_SECTIONS) {
      throw new AssetError(
        `found ${sectionCount} "## " sections, expected at least ${MIN_PROMPT_SECTIONS} — ` +
          "see docs/04_AGENT_SPEC.md §3 for the seven required sections",
        source,
      );
    }

    for (const clause of REQUIRED_CLAUSES) {
      if (!body.includes(clause.marker)) {
        throw new AssetError(
          `missing ${clause.describes} — expected the text ${JSON.stringify(clause.marker)} to appear. ` +
            "These clauses are enforced at build time; see docs/04_AGENT_SPEC.md §3.",
          source,
        );
      }
    }

    entries.push({ id, body });
  }

  entries.sort((a, b) => a.id.localeCompare(b.id));

  const lines: string[] = [
    "// AUTO-GENERATED by scripts/build-assets.mts — do not edit.",
    "//",
    "// Source of truth: prompts/*.md. The header block of each file (title,",
    "// placement note, warnings) is stripped; the prompt body begins at the first",
    '// "## " heading. See docs/02_TECH_SPEC.md §4.',
    "",
    "export const PROMPTS = {",
  ];

  for (const entry of entries) {
    lines.push(`  ${JSON.stringify(entry.id)}: ${JSON.stringify(entry.body)},`);
  }

  lines.push("} as const;", "");
  lines.push("export type PromptId = keyof typeof PROMPTS;", "");

  const output = lines.join("\n");
  mkdirSync(GENERATED_DIR, { recursive: true });
  writeFileSync(join(GENERATED_DIR, "prompts.ts"), output, "utf8");

  return {
    count: entries.length,
    bytes: entries.reduce((sum, e) => sum + countChars(e.body), 0),
  };
}

// ---------------------------------------------------------------------------
// 2. Knowledge
// ---------------------------------------------------------------------------

interface ManifestEntry {
  chunks: number;
  hash: string;
  files: number;
}

interface KnowledgeBuild {
  agents: string[];
  chunks: number;
  warnings: string[];
  manifest: Record<string, ManifestEntry>;
}

function buildKnowledge(): KnowledgeBuild {
  if (!existsSync(KNOWLEDGE_DIR)) {
    throw new AssetError("knowledge/ directory not found", "knowledge/");
  }

  // Rebuild from scratch so a deleted file cannot leave a stale index behind.
  rmSync(PUBLIC_KNOWLEDGE_DIR, { recursive: true, force: true });
  mkdirSync(PUBLIC_KNOWLEDGE_DIR, { recursive: true });

  const agentIds = listDirectories(KNOWLEDGE_DIR);
  if (agentIds.length === 0) {
    throw new AssetError("knowledge/ contains no agent directories", "knowledge/");
  }

  const manifest: Record<string, ManifestEntry> = {};
  const warnings: string[] = [];
  let totalChunks = 0;

  for (const agentId of agentIds) {
    const agentDir = join(KNOWLEDGE_DIR, agentId);
    const files = listMarkdownFiles(agentDir);

    if (files.length === 0) {
      throw new AssetError(
        `no markdown files — either add knowledge or remove the directory. ` +
          "An empty index would silently produce an agent that never retrieves anything.",
        `knowledge/${agentId}/`,
      );
    }

    const chunks: Chunk[] = [];
    for (const file of files) {
      const source = rel(file);
      const result = chunkKnowledgeFile({
        raw: readFileSync(file, "utf8"),
        file: source,
        agentId,
      });
      chunks.push(...result.chunks);
      warnings.push(...result.warnings);
    }

    const payload = { agentId, chunks };
    const serialized = JSON.stringify(payload);
    const hash = sha256(serialized);

    const withVersion = JSON.stringify({ agentId, version: hash, chunks }, null, 0);
    writeFileSync(join(PUBLIC_KNOWLEDGE_DIR, `${agentId}.json`), withVersion, "utf8");

    manifest[agentId] = { chunks: chunks.length, hash, files: files.length };
    totalChunks += chunks.length;
  }

  const manifestOutput = JSON.stringify({ version: 1, agents: manifest }, null, 2);
  writeFileSync(join(PUBLIC_KNOWLEDGE_DIR, "manifest.json"), manifestOutput + "\n", "utf8");

  return { agents: agentIds, chunks: totalChunks, warnings, manifest };
}

// ---------------------------------------------------------------------------
// 3. pdf.js worker and cMaps
// ---------------------------------------------------------------------------

interface PdfBuild {
  version: string;
  workerBytes: number;
  cmaps: number;
}

/**
 * Copies the two things pdf.js loads at runtime over the network.
 *
 * The version guard is the point of this function existing at all. The worker is
 * a *separate build artefact* of the same library, and nothing in the type system
 * or the bundler ties it to the `pdfjs-dist` the application code imports — so
 * `npm update` could pair a 6.x worker with a 7.x API bundle and the symptom
 * would be a PDF that fails to parse, in a browser, with no build error. Pinning
 * the dependency exactly (`package.json`, no caret) closes the usual route; this
 * check closes the rest, including a hand-edited lockfile.
 *
 * `public/pdf/` is rebuilt from scratch like `public/knowledge/`, so a cMap
 * removed upstream cannot linger and be served.
 */
function buildPdfAssets(): PdfBuild {
  const packageJsonPath = join(PDFJS_DIR, "package.json");
  const workerPath = join(ROOT, PDF_WORKER_SOURCE);
  const cmapsDir = join(ROOT, PDF_CMAPS_SOURCE);

  if (!existsSync(packageJsonPath)) {
    throw new AssetError(
      "pdfjs-dist is not installed — run `npm install`. Uploads parse PDFs in the " +
        "browser, so this is a runtime dependency, not a dev one.",
      rel(PDFJS_DIR),
    );
  }

  const installed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version?: string };
  const version = installed.version ?? "unknown";

  if (version !== PDFJS_VERSION) {
    throw new AssetError(
      `installed pdfjs-dist is ${version} but lib/files/vendor.ts declares ${PDFJS_VERSION}. ` +
        "The worker and the API bundle are version-coupled: a mismatch ships a worker that " +
        "does not match the code calling it, and the failure surfaces only as a PDF that will " +
        "not parse. Update PDFJS_VERSION and re-run `npm install`.",
      rel(packageJsonPath),
    );
  }

  if (!existsSync(workerPath)) {
    throw new AssetError(
      `worker not found at ${PDF_WORKER_SOURCE} — pdfjs-dist's layout changed. Check ` +
        "lib/files/vendor.ts against the installed package before adjusting it.",
      rel(workerPath),
    );
  }

  if (!existsSync(cmapsDir)) {
    throw new AssetError(
      `cMap directory not found at ${PDF_CMAPS_SOURCE}. Without cMaps a CJK PDF throws ` +
        "rather than producing mojibake, which makes this a hard failure, not a degradation.",
      rel(cmapsDir),
    );
  }

  rmSync(PUBLIC_PDF_DIR, { recursive: true, force: true });
  mkdirSync(join(PUBLIC_PDF_DIR, "cmaps"), { recursive: true });

  const workerTarget = join(ROOT, "public", PDF_WORKER_PUBLIC_PATH);
  copyFileSync(workerPath, workerTarget);

  const cmapNames = readdirSync(cmapsDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  const nonFile = cmapNames.find((entry) => !entry.isFile());
  if (nonFile) {
    throw new AssetError(
      `unexpected ${nonFile.isDirectory() ? "directory" : "entry"} "${nonFile.name}" inside the cMap ` +
        "directory — this copy is flat by assumption, and skipping it would ship an incomplete set.",
      rel(join(cmapsDir, nonFile.name)),
    );
  }
  if (cmapNames.length === 0) {
    throw new AssetError("cMap directory is empty", rel(cmapsDir));
  }

  for (const entry of cmapNames) {
    copyFileSync(join(cmapsDir, entry.name), join(ROOT, "public", PDF_CMAPS_PUBLIC_PATH, basename(entry.name)));
  }

  return { version, workerBytes: statSync(workerTarget).size, cmaps: cmapNames.length };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

function main(): void {
  const started = Date.now();

  const prompts = buildPrompts();
  const knowledge = buildKnowledge();
  const pdf = buildPdfAssets();

  console.log("");
  console.log("  build:assets");
  console.log("");
  console.log(`  prompts      ${prompts.count} file(s), ${prompts.bytes} chars -> lib/generated/prompts.ts`);
  console.log(`  knowledge    ${knowledge.agents.length} agent(s), ${knowledge.chunks} chunk(s) -> public/knowledge/`);
  console.log(
    `  pdf.js       ${pdf.version}, worker ${pdf.workerBytes} bytes, ${pdf.cmaps} cMaps -> public/pdf/`,
  );
  for (const agentId of knowledge.agents) {
    const entry = knowledge.manifest[agentId];
    if (!entry) continue;
    console.log(
      `                 ${agentId.padEnd(10)} ${String(entry.chunks).padStart(4)} chunks  ` +
        `${String(entry.files).padStart(2)} files  ${entry.hash}`,
    );
  }

  if (knowledge.warnings.length > 0) {
    console.log("");
    console.log(`  ${knowledge.warnings.length} warning(s) — sections outside the 200–500 char band:`);
    for (const warning of knowledge.warnings) {
      console.log(`    ${warning}`);
    }
    console.log("  Warnings do not fail the build. See docs/02_TECH_SPEC.md §8.1.");
  }

  console.log("");
  console.log(`  done in ${Date.now() - started}ms`);
  console.log("");
}

try {
  main();
} catch (error) {
  if (error instanceof AssetError) {
    console.error("");
    console.error(`  build:assets FAILED`);
    console.error("");
    console.error(`    ${error.message}`);
    console.error("");
    process.exit(1);
  }
  throw error;
}
