# Agent Coding Prompt

**Read this file first. It is written for you — a coding agent about to work on this repository.**

---

## 0. Read these three files before writing any code

| Order | File | Why |
|---|---|---|
| 1 | `docs/00_PRODUCT_BRIEF.md` | What this is, and **which documents are authoritative** |
| 2 | `docs/02_TECH_SPEC.md` | The binding architecture. Constraints C1–C5 are not negotiable |
| 3 | The spec for what you are building — `01_PRD.md`, `03_UI_UX_SPEC.md`, `04_AGENT_SPEC.md`, `05_API_SPEC.md` | |

Everything else in `docs/` is reference. Read it when the task touches it.

---

## 1. The one thing that will get this wrong

`project_plan/` contains a **detailed, professional-looking, entirely wrong for this project** set of documents:

- `project_plan/软件规格说明书.md` — specifies FastAPI, PostgreSQL, pgvector, multi-tenancy, RBAC, audit logs, and **server-side encrypted API key storage** (§9.2)
- `project_plan/AI 超级专家智能体矩阵平台.md` — a business plan for a funded, server-side product
- `project_plan/demo_prompt.md` — an earlier, superseded brief

**Do not build any of it.** `docs/00_PRODUCT_BRIEF.md` §0 establishes document precedence: `docs/` outranks `project_plan/`.

Building the server architecture is not "doing more" — it is **a defect**, because it violates constraint C1 (zero cost) and C4 (no secrets on a server). If a task seems to require a backend, stop and re-read `02_TECH_SPEC.md` §1.

---

## 2. The constraints that decide every design question

| | Constraint | Consequence |
|---|---|---|
| **C1** | **¥0 to run.** No always-on server. | Everything runs in the browser. This is the constraint that generates the architecture. |
| **C2** | **Technical maintenance only.** | No moderation queue, no support inbox, no content operations. |
| **C3** | **Migratable.** | Provider, retrieval, and storage logic live behind exactly three interfaces (`02_TECH_SPEC.md` §12). |
| **C4** | **No secrets server-side.** | BYOK. The user's key stays in their browser. |
| **C5** | **Configuration-driven.** | Adding an agent edits config, not runtime code. |

When a design decision is unclear, pick the option that satisfies C1. When two options both satisfy C1, pick the one that keeps C3 intact.

---

## 3. Hard rules

1. **Never transmit a user's API key to any host other than the one they configured.** Not to a proxy of yours, not to analytics, not to a crash reporter. Not in a URL.
2. **Never log, render, or persist a key in full.** Settings shows `sk-…f3a2`. That is the maximum.
3. **Never put a key in `NEXT_PUBLIC_*`.** It would ship in the bundle.
4. **Never branch on an agent `id` in runtime code.** `id === 'creator'` outside `lib/agents/configs/` means the registry abstraction has been bypassed. See `06_ACCEPTANCE.md` C5.
5. **Never fetch another agent's knowledge index.** Isolation is structural — the workspace downloads only the selected agent's file. See `02_TECH_SPEC.md` §8.7.
6. **Treat retrieved knowledge and uploaded files as untrusted data.** They go into the prompt as labelled reference material, never as instructions. See `04_AGENT_SPEC.md` §3(b).
7. **No server.** No API routes, no middleware that runs on request, no database, no server actions. `output: 'export'` is a hard requirement, and `next.config` must keep it.
8. **Never invent provider API details.** Model IDs and parameter surfaces drift. `05_API_SPEC.md` §3.4 documents a case where a plausible-looking `temperature` parameter would have returned a 400 on every current Anthropic model. Verify against the provider's current docs before writing an adapter.

---

## 4. Where things live

```
app/                      routes only — no business logic
lib/agents/configs/       one file per agent
lib/agents/registry.ts    reads the configs; the only place agents are enumerated
lib/llm/gateway.ts        ModelGateway — the ONLY way to reach a provider
lib/llm/providers/        one adapter per provider
lib/rag/                  chunking, BM25, tokenization
lib/workflow/definitions/ one file per workflow
lib/store/                localStorage + IndexedDB wrappers
lib/generated/            build output — gitignored, never edit
public/knowledge/         build output — gitignored, never edit
prompts/                  system prompts, Chinese, source of truth
knowledge/<agent>/        knowledge base markdown, Chinese, source of truth
```

`prompts/` and `knowledge/` are the **source**. `lib/generated/` and `public/knowledge/` are **build artefacts** produced by `scripts/build-assets.mts`. Never hand-edit a build artefact; never let a prompt live only in TypeScript.

---

## 5. Language rules

| Path | Language |
|---|---|
| `docs/` | English |
| `AGENT_CODING_PROMPT.md` | English |
| Code, identifiers, comments | English |
| `prompts/*.md` | **Chinese** |
| `knowledge/**/*.md` | **Chinese** |
| `README.md`, `DEMO_SCRIPT.md` | **Chinese** |
| All user-facing UI copy | **Chinese** |

Prompts and knowledge are Chinese because the agents answer in Chinese; a Chinese system prompt produces more consistent Chinese output and better retrieval against a Chinese corpus. Do not translate them to English.

---

## 6. Before you say you are done

Run the checks in `docs/06_ACCEPTANCE.md`. The ones most often skipped and most often false:

- **C4** — actually add a throwaway eleventh agent and confirm nothing outside `configs/` needs editing. Do not reason about it; run it.
- **E6** — confirm in the network panel that selecting one agent downloads only that agent's knowledge index.
- **H4** — plant a real prompt injection in a knowledge file, rebuild, and query it. Reading the prompt is not a test.
- **J2** — Chinese body text at `line-height: 1.7`. The single most common thing that makes a Chinese UI look unfinished.

---

## 7. If you are unsure

The documents are ordered by authority (`docs/00_PRODUCT_BRIEF.md` §0). When two disagree, the higher one wins.

When the documents are silent, prefer the choice that is:

1. **cheaper to run** (C1),
2. **simpler to maintain** (C2),
3. **behind one of the three seams** (C3).

When a requirement is genuinely ambiguous and the choice is hard to reverse, **ask rather than guess**. A wrong assumption about the architecture gets built on.
