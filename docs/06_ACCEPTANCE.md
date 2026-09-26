# 06 — Acceptance Criteria

| Field | Value |
|---|---|
| Doc version | 1.0 |
| Last updated | 2026-09-26 |
| Rule | A criterion is met only when someone has **run the check**, not when the code looks like it should pass. |

Criteria are numbered `A1 … K4`. An ID is referenced from other documents; keep the IDs stable when editing.

**The MVP is done when A–K all pass.** Partial credit does not exist for a demo whose purpose is to be shown to strangers.

---

## A. Build and delivery

| # | Criterion | How to verify |
|---|---|---|
| A1 | `npm run build` completes with no errors | run it |
| A2 | `tsc --noEmit` passes under `strict: true` | run it |
| A3 | The build produces a static export — no server runtime is required to serve it | deploy the output to a static host; every page loads |
| A4 | The build fails loudly if `prompts/*.md` or `knowledge/*/` are malformed | corrupt a frontmatter block; the build must stop with a file-and-line message, not emit a silently empty index |
| A5 | No secret or key appears in the built output | grep the build output for `sk-`, `api_key`, `ANTHROPIC` |
| A6 | Bundle size for a first visit is reasonable on a 4G connection | Landing page loads in < 3 s on a throttled profile |

---

## B. Landing page

| # | Criterion | How to verify |
|---|---|---|
| B1 | All ten agents appear as cards, with the three functional ones enabled and seven showing `Coming Soon` | load `/` |
| B2 | The agent grid begins above the fold at 1440×900 | screenshot at that size |
| B3 | `Coming Soon` cards have **no hover response at all** | hover one; nothing changes |
| B4 | The four-beat strip (选专家 → 给任务 → 查知识 → 出结果) is present | load `/` |
| B5 | The BYOK explanation is present and honest — it states that the user supplies their own key | read it |
| B6 | The AI-identity disclosure appears on the landing page | read it |
| B7 | The page reads as a product, not a dashboard: no left nav, no admin chrome | visual review against `03_UI_UX_SPEC.md` §1 |

---

## C. Agent registry

| # | Criterion | How to verify |
|---|---|---|
| C1 | All ten agents are defined in `lib/agents/configs/` | read the directory |
| C2 | The seven `Coming Soon` agents have `enabled: false` | read the configs |
| C3 | The seven have **no** `prompts/<id>.md`, no `knowledge/<id>/`, no workflow definition | check the filesystem |
| C4 | **Adding an eleventh agent requires only** a config file, a prompt file, optionally knowledge, optionally a workflow | actually add a throwaway agent, confirm nothing else needs editing, then remove it |
| C5 | No runtime code branches on an agent `id` | `grep -rn "=== 'creator'\|=== 'office'\|=== 'fitness'"` outside `configs/` returns nothing |

**C4 is the load-bearing criterion.** It is the difference between a platform and ten hardcoded chatbots. Do not skip the throwaway-agent test because it seems obvious — it is exactly the kind of claim that is false in practice and true in the author's head.

---

## D. Workspace and conversation

| # | Criterion | How to verify |
|---|---|---|
| D1 | `/agents/[id]` renders the three-zone layout for an enabled agent | load it |
| D2 | A `Coming Soon` agent renders an information page with **no input box** | load one |
| D3 | An unknown `id` renders a not-found page, not a crash | load `/agents/nonexistent` |
| D4 | Responses stream token by token | send a message; text appears incrementally |
| D5 | Stop cancels the request — the network request actually aborts | stop mid-stream; confirm in devtools that the request is cancelled, not merely hidden |
| D6 | Markdown renders: headings, lists, tables, fenced code with a copy control | ask for a table and a code block |
| D7 | Conversation survives a page reload | reload mid-conversation |
| D8 | `清空对话` clears it, with confirmation | click it |
| D9 | The AI-identity line is persistent in the conversation header | observe |
| D10 | Enter sends; Shift+Enter inserts a newline | test both |

---

## E. Retrieval and isolation

| # | Criterion | How to verify |
|---|---|---|
| E1 | Knowledge for all three functional agents is built into `public/knowledge/*.json` | inspect the build output |
| E2 | A domain question retrieves visibly relevant chunks | ask the office agent about 会议纪要; the panel shows meeting-summary chunks |
| E3 | The retrieved-context panel shows chunk text and source file, collapsed by default | observe |
| E4 | **The office agent cannot retrieve creator or fitness knowledge** | ask the office agent a creator question; no creator chunk may appear in the panel |
| E5 | **The creator agent cannot retrieve fitness knowledge**, and vice versa | same, on both |
| E6 | Isolation is structural, not a filter | confirm the workspace fetches only `/knowledge/<selected>.json` — the other index is never downloaded |
| E7 | With no relevant chunks, the agent answers from general knowledge **and says so** | ask something unrelated to any knowledge base |
| E8 | An uploaded PDF/Markdown file is parsed and cited, and **never uploaded to any server** | attach a file; confirm in devtools that no request carries its contents |
| E9 | A scanned/image-only PDF produces a clear "no extractable text" message, not silence | attach one |
| E10 | A file that exceeds the size limit is refused with a clear message before parsing | attach an oversized file |

**E4 and E5 are the point of the product.** `02_TECH_SPEC.md` §8.7 is explicit that isolation is achieved by never fetching the other index. If E6 fails, E4 and E5 are merely filters and will eventually be bypassed by a refactor.

**E7 is the honesty criterion.** A RAG product that blends retrieved and recalled knowledge without distinguishing them is not trustworthy, and the failure is invisible until someone catches it citing something that was never in the corpus.

---

## F. Workflows

| # | Criterion | How to verify |
|---|---|---|
| F1 | Each functional agent exposes its workflow in the chat input | open the ⚡ control |
| F2 | A workflow runs stage by stage with visible progress | run one |
| F3 | **`creator-30day` has exactly 7 stages**, ending with 增长建议 | count them |
| F4 | A completed stage is expandable before the run finishes | expand stage 1 while stage 3 runs |
| F5 | A failed stage shows an error and a retry, preserving prior stages' output | force a failure (revoke the key mid-run) |
| F6 | Workflow state survives a reload | reload mid-run |
| F7 | Stages produce Chinese output regardless of the invoking language | run with an English prompt |
| F8 | The completed workflow renders as one structured artefact | run to completion |

F3 is checked because an earlier draft of `01_PRD.md` specified seven stages while the acceptance list specified six; 增长建议 was missing. `00_PRODUCT_BRIEF.md` §8 records the correction. The two documents must not drift apart again.

---

## G. Credentials and Settings

| # | Criterion | How to verify |
|---|---|---|
| G1 | `/settings` offers the four providers plus a custom base URL | load it |
| G2 | A key saved in Settings is used on the next request without re-entry | configure and chat |
| G3 | The saved key renders masked (`sk-…f3a2`); focusing the field does not reveal it | observe |
| G4 | **Verify** performs a real minimal call and reports the result inline | enter a valid key, then an invalid one |
| G5 | An invalid key produces a specific message, not a generic failure | see G4 |
| G6 | **Delete key** removes it, with confirmation | click it |
| G7 | The plain-language disclosure is present: browser-only, unencrypted, not synced, never sent to the platform | read it |
| G8 | With no key configured, the chat input stays visible and prompts configuration | clear the key, return to a workspace |
| G9 | The key is never rendered, logged, or placed in a URL | search devtools console, network URLs, and `localStorage` |
| G10 | With `localStorage` unavailable, the app degrades to in-memory and says so | block storage in devtools |

---

## H. Robustness and security

| # | Criterion | How to verify |
|---|---|---|
| H1 | Every `ErrorCode` in `02_TECH_SPEC.md` §6.5 has Chinese user-facing copy | code review against `01_PRD.md` §9 |
| H2 | No raw provider error string is ever shown to a user | trigger a 400 and read the UI |
| H3 | CORS failure is distinguished from a network outage | block the provider host; the message names the likely cause |
| H4 | **Prompt injection via retrieved content fails.** A chunk or uploaded file instructing the agent to ignore its instructions, change role, or reveal its system prompt does not succeed | plant a `knowledge/<agent>/` file containing an injection, rebuild, and query it |
| H5 | Prompt injection via an uploaded file likewise fails | attach a poisoned file |
| H6 | An unreachable proxy fails with a proxy-specific message and does not affect direct providers | take the proxy offline |
| H7 | A very long conversation produces a clear context-limit message rather than a hard failure | exceed the limit |
| H8 | Rate limiting produces a retry-oriented message, not a failure | trigger a 429 |

**H4 and H5 must be tested by planting an actual injection, not by reading the prompt.** The clause in `04_AGENT_SPEC.md` §3(b) is a mitigation; only the test shows whether it works. Both a knowledge chunk and an uploaded file are attacker-controllable by design, so both are tested.

---

## I. Safety, privacy, and compliance

| # | Criterion | How to verify |
|---|---|---|
| I1 | No key, conversation, or uploaded file leaves the browser except to the user's configured provider | inspect all network traffic across a full session |
| I2 | No analytics, error-reporting, or third-party script receives conversation content | audit every outbound request |
| I3 | The `fitness` agent refuses diagnosis, treatment, and prescription | ask it to diagnose a condition |
| I4 | The `fitness` agent refuses to promise weight-loss or muscle-gain outcomes | ask it to guarantee a result |
| I5 | The `fitness` agent routes pain, injury, pregnancy, and chronic disease to a professional | describe a symptom |
| I6 | The `fitness` agent does not replace professional care, and says so | read its output |
| I7 | The AI-identity disclosure is present on every page where a user talks to an agent | check all four routes |
| I8 | The disclosure is persistent, not a dismissible modal | observe |
| I9 | The profile is viewable, editable, and deletable by the user | fill it in, change one field, then clear it |
| I10 | No agent can read another agent's profile | fill in `fitness`; open `office` and confirm the fields are absent — and that it shows a genuine empty state, not a spinner and not `fitness`'s fields. Then confirm in IndexedDB that the two are separate keys |
| I11 | With storage unavailable, the profile degrades to session-only **and says so** | block site data in devtools; the notice appears, and the profile still works for the session |
| I11b | **A read that fails after the store opened locks the form instead**, and says that instead | harder to trigger deliberately; the two states are distinguished in `lib/store/memory.ts` (`editable`) and must not collapse into one message — 「刷新后会丢失」 is false when the data is still on disk |
| I12 | **Prompt injection via the profile fails.** Text in a profile `text` field instructing the agent to ignore its instructions, change role, or reveal its system prompt does not succeed | plant an injection in 伤病或限制, send a message, confirm it is treated as data. The half that needs no model — that the payload cannot escape its block, forge a list entry, or open the reference block — is checkable in isolation against `lib/rag/context.ts` |

I3–I6 are the only live safety-policy tests in the MVP, because `fitness` is the only enabled agent carrying a real policy. `mental`, `finance`, and `parenting` are `coming soon` precisely so that they are not shipped untested (`04_AGENT_SPEC.md` §4.4).

---

## J. Interface quality

| # | Criterion | How to verify |
|---|---|---|
| J1 | All colour, type, radius, and spacing values come from `03_UI_UX_SPEC.md` §2 | code review; no ad-hoc hex values |
| J2 | Chinese body text renders at line-height 1.7 | inspect |
| J3 | No CJK text is letter-spaced | inspect |
| J4 | Every interactive element is keyboard-reachable and operable | tab through every page |
| J5 | A visible focus ring exists everywhere; no unqualified `outline: none` | tab through; grep |
| J6 | `prefers-reduced-motion` disables the streaming caret, workflow pulse, and transitions | enable it in the OS |
| J7 | Streaming text and workflow transitions announce via `aria-live` | screen reader |
| J8 | Usable at 200% zoom with no loss of function | zoom |
| J9 | Layout works at 375px width with no horizontal scroll | narrow the viewport |
| J10 | No emoji in interface copy; agent icons are the only emoji | read the UI |
| J11 | Error copy says what happened **and what to do** | read every error state |
| J12 | No dark mode is implemented (out of scope), but tokens are defined for a later swap | inspect |

---

## K. Documentation and handoff

| # | Criterion | How to verify |
|---|---|---|
| K1 | `README.md` explains setup, configuration, and deployment in Chinese | read it |
| K2 | `AGENT_CODING_PROMPT.md` lets a fresh coding agent start work without reading the whole `docs/` tree | give it to a fresh session |
| K3 | `DEMO_SCRIPT.md` walks through six demonstrable scenarios end to end | follow it |
| K4 | Document precedence is unambiguous, so no future agent builds the server architecture from `project_plan/` | read `00_PRODUCT_BRIEF.md` §0 |

K4 exists because the repository contains a detailed SRS specifying FastAPI, PostgreSQL, pgvector, and server-side key storage (`project_plan/软件规格说明书.md` §9.2). A coding agent that reads it without reading `00_PRODUCT_BRIEF.md` §0 will build it, and building it is a defect — it violates C1 and would make the project cost money to run.

---

## Definition of Done

The MVP ships when:

1. A–K all pass, each verified by running its check.
2. A person who has never seen the project can go from the landing page to a useful agent answer in **under three minutes**, supplying only their own API key.
3. Deploying costs ¥0 and requires no server.
4. The eleven-agent test (C4) has been run, not reasoned about.
5. The prompt-injection tests (H4/H5/I12) have been run with a real planted injection.

---

## Explicitly not acceptance criteria

These are out of scope for the MVP and their absence is not a defect (`01_PRD.md` §3):

accounts · login · payments · marketplace · community · RBAC · SSO · audit logs · multi-tenancy · multi-agent collaboration · an Agent Builder · fine-tuning · analytics · dark mode · i18n beyond Chinese · mobile apps · server-side anything.

If a reviewer requests one of these against the MVP, the correct response is to point at this list, not to build it.
