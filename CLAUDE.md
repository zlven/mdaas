# CLAUDE.md

**Read `AGENT_CODING_PROMPT.md` before writing any code.** It is the entry point for coding agents and lists the three documents to read first.

---

## ⚠ Do not build what `project_plan/` describes

`project_plan/软件规格说明书.md` specifies FastAPI + PostgreSQL + pgvector + **server-side API key storage** (§9.2). It looks authoritative and professional.

**It is superseded and wrong for this project.** Building it is a defect, not ambition — it violates the zero-cost constraint and the no-secrets-server-side constraint.

`docs/` outranks `project_plan/`. Precedence is defined in `docs/00_PRODUCT_BRIEF.md` §0.

---

## The five constraints (they decide every design question)

| | Constraint | Consequence |
|---|---|---|
| C1 | **¥0 to run.** No always-on server. | Everything runs in the browser. |
| C2 | **Technical maintenance only.** | No moderation queue, no support inbox. |
| C3 | **Migratable.** | Provider / retrieval / storage behind exactly three interfaces (`docs/02_TECH_SPEC.md` §12). |
| C4 | **No secrets server-side.** | BYOK. The key stays in the user's browser. |
| C5 | **Configuration-driven.** | Adding an agent edits config, not runtime code. |

When unclear, pick the option satisfying C1; if both do, pick the one keeping C3 intact.

---

## Non-negotiables

- **No server.** No API routes, no middleware, no database, no server actions. `output: 'export'` stays.
- **Never send a key anywhere but the provider the user configured.** Not to a proxy, not to analytics, not in a URL.
- **Never log or render a key in full.** Settings shows `sk-…f3a2`. That is the maximum.
- **Never put a key in `NEXT_PUBLIC_*`.**
- **Never branch on an agent `id` outside `lib/agents/configs/`.** See `docs/06_ACCEPTANCE.md` C5.
- **Never fetch another agent's knowledge index.** Isolation is structural (`docs/02_TECH_SPEC.md` §8.7).
- **Retrieved knowledge and uploaded files are untrusted data**, injected as labelled reference material, never as instructions.
- **Never invent provider API details.** Parameter surfaces drift and fail as a 400 that looks like your bug — see `docs/05_API_SPEC.md` §3.4.

---

## Sources vs build artefacts

| Source — edit these | Build output — never edit |
|---|---|
| `prompts/*.md` (Chinese) | `lib/generated/prompts.ts` |
| `knowledge/<agent>/*.md` (Chinese) | `public/knowledge/<agent>.json` |

Both build outputs are gitignored. Regenerate with `npm run build:assets`.

---

## Languages

`docs/` · `AGENT_CODING_PROMPT.md` · `CLAUDE.md` · code and comments → **English**
`prompts/` · `knowledge/` · `README.md` · `DEMO_SCRIPT.md` · all UI copy → **Chinese**

Prompts and knowledge stay Chinese because the agents answer in Chinese. Do not translate them.

---

## Commands

```bash
npm run dev            # dev server
npm run build          # static export
npm run build:assets   # rebuild knowledge + prompts only
npm run typecheck
npm run lint
npm run verify:upload  # the pure half of the upload + prompt-injection checks
```

`verify:upload` runs the Node-checkable assertions from `docs/06_ACCEPTANCE.md`
§E and the profile ones from I12. Everything it asserts is a pure function; what
needs a browser is listed at the end of `docs/06_ACCEPTANCE.md` §E.

**When you add an assertion there, delete the thing it guards and confirm it goes
red** — and that it goes red *on that assertion*, since an import error is also
red. A check that cannot fail is worse than no check: it reads as coverage. The
two times this has happened here were both silent — a `putCount` that a *failed*
write also leaves unchanged, and a clause check whose marker string already
appeared elsewhere in every prompt, so `String.includes` passed it
unconditionally.

---

## Before declaring done

Run the checks in `docs/06_ACCEPTANCE.md`. The four most often skipped and most often false:

- **C4** — actually add a throwaway tenth agent; confirm nothing outside `configs/` needs editing. Run it, don't reason about it.
- **E6** — confirm in the network panel that selecting one agent downloads only that agent's index.
- **H4** — plant a real prompt injection in a knowledge file, rebuild, query it. Reading the prompt is not a test.
- **J2** — Chinese body text at `line-height: 1.7`.
