# 01 — Product Requirements

| Field | Value |
|---|---|
| Doc version | 1.0 |
| Last updated | 2026-09-26 |
| Scope | MVP demo only |
| Read with | `00_PRODUCT_BRIEF.md` (framing), `02_TECH_SPEC.md` (binding architecture) |

---

## 1. Goal

A visitor arriving from a social feed must be able to complete this sequence **without creating an account, without reading any instructions, and within about ninety seconds**:

1. Land on the site and understand what it is.
2. Browse the experts.
3. Open one.
4. Configure a model provider (BYOK).
5. Give it a task.
6. Watch it consult its own domain knowledge.
7. Run a multi-step workflow.
8. See the workflow's progress.
9. Receive a structured, professional-looking result.

If any of those nine steps is confusing enough to lose the visitor, the demo has failed at its only job.

---

## 2. Scope boundary

### In scope

| # | Item |
|---|---|
| 1 | Landing page |
| 2 | Agent grid — all 10 visible, 3 functional |
| 3 | Agent workspace — chat, streaming, markdown |
| 4 | BYOK settings — provider, key, model, verification |
| 5 | Agent-scoped RAG, in-browser |
| 6 | File upload (PDF / DOCX / TXT / MD), parsed client-side |
| 7 | Creator 30-day content workflow, with progress UI |
| 8 | Office meeting-summary and Fitness plan structured flows |
| 9 | Per-agent safety policies, at minimum `health-edu` on `fitness` |
| 10 | AI identity transparency |
| 11 | Error and empty states throughout |
| 12 | Per-agent profile — structured fields the **config** declares, plus one free-text 补充说明 the user writes, stored in this browser (`04_AGENT_SPEC.md` §6) |
| 13 | Per-agent instant tools — small client-side utilities usable without a conversation (`04_AGENT_SPEC.md` §7) |

### Explicitly out of scope

Do **not** build these. Each is either impossible without a backend (§ `02_TECH_SPEC.md` C1) or belongs to a later phase.

| Excluded | Why |
|---|---|
| Accounts, login, sessions | Requires a backend |
| Payments, subscription, entitlements | Requires a backend |
| Template marketplace, template purchase | Requires a backend + payment |
| Community, comments, forum | Requires a backend + daily operations. Cut by decision. |
| Enterprise workspace, RBAC, SSO, audit | Requires a backend |
| Multi-tenancy | Requires a backend |
| Multi-agent collaboration | Requires orchestration; no user-facing need yet |
| Agent Builder (user-authored agents) | Phase 3 |
| Fine-tuning, LoRA, adapters | Not needed for the concept |
| Analytics dashboards, business metrics | No data to aggregate without a backend |
| Real-time collaboration | No use case |
| Voice, image generation | Separate capability, separate cost |

**If a feature is not in the in-scope list, it is not in the MVP.** Build it and it becomes a defect: unreviewed surface area that contradicts a hard constraint.

---

## 3. Pages

Four pages. No more.

### 3.1 `/` — Landing

| Zone | Contents |
|---|---|
| Hero | Product name, one-line positioning, sub-line, primary CTA |
| Agent matrix | Grid of all 10 agent cards |
| How it works | The five-step action chain from §1, compressed to four or five beats |
| BYOK explainer | One short block: you bring your own model key, we never see it |
| Footer | Repo, docs, disclosure that this is a demo |

**Must not** be a wall of marketing copy. The grid is the argument.

### 3.2 `/agents` — Expert directory

All 10 agents. Cards for the three functional agents link to their workspace; the seven `Coming Soon` cards are visibly inert (no hover lift, no cursor change, no navigation).

Filters are **not** in the MVP — ten cards fit on one screen.

### 3.3 `/agents/[id]` — Agent workspace

```
┌────────────────────────────────────────────────────────────┐
│ ← Back        💼 Office Expert          [Settings] [Clear] │
├──────────────┬──────────────────────────────┬──────────────┤
│              │ [会议成本] [口播时长]          │ Capabilities │
│  Agent       │ ┌──────────────────────────┐ │              │
│  identity    │ │ 按人数、时长和平均时薪…    │ │ Knowledge    │
│              │ │ ──────────────────────── │ │ Tools        │
│  description │ └──────────────────────────┘ │ Workflow     │
│              │                              │ ──────────── │
│  tags        │      Conversation            │ 我的档案      │
│              │                              │ 身高(cm)[175]│
│              │                              │ ──────────── │
│              │                              │  本次检索     │
├──────────────┴──────────────────────────────┴──────────────┤
│ [📎 Attach] [⚡ Workflow]                     [Send →]      │
└────────────────────────────────────────────────────────────┘
```

Right rail collapses below `lg`. Below `md`, chat takes the full viewport and the agent identity moves into the header.

**The tools strip sits at the top of the centre column; the profile sits in the right rail.** The two are not the same kind of thing, which is why they no longer share a position:

- The **tools** are operations, and an operation belongs where the work happens. They also hold *drafts* — a half-filled 会议成本 is component state, not stored state — so they must exist exactly once in the DOM, and the centre column is the only zone present at every breakpoint.
- The **profile** is not an operation. It is standing facts about the user, alongside what the agent can do and what it knows — all of which describe this conversation's context and none of which the user operates. It is stored state read straight from the store, with no draft, so it *can* exist twice; below `lg`, where the rail is gone, it falls back to a collapsed strip in the centre column so it stays reachable at every width (`03_UI_UX_SPEC.md` §5).

The tools strip is one line tall however many tools an agent declares; the selected tool's panel opens below it.

Opening a `Coming Soon` agent's URL directly must render the agent's description with a clear "not available yet" state and **no input box**.

### 3.4 `/settings` — Model provider

Sections: Provider → API key → Model → (optional) Proxy URL → Connection status.

`/settings` must be reachable from every workspace and from the landing header. A visitor who reaches step 5 without a key must be able to get to Settings in one click, **and must arrive already knowing why they need to**.

---

## 4. Agent card

```
┌───────────────────────────┐
│ 💼                        │
│                           │
│ AI Office Expert          │
│ AI 全能办公专家            │
│                           │
│ Meetings · Reports · PPT  │
│                           │
│ ● Available               │
│                           │
│ Open Expert →             │
└───────────────────────────┘
```

Required fields: icon, English name, Chinese name, one-line description, 3–5 capability tags, status badge, open affordance.

Cards are product modules, not dashboard widgets. See `03_UI_UX_SPEC.md` §4.

---

## 5. Chat

The conversation surface must support:

- user messages and assistant messages, visually distinct
- **streaming** response rendering (not optional — a silent multi-second wait reads as broken)
- stop generation mid-stream
- Markdown rendering: headings, lists, tables, blockquotes, inline code, fenced code blocks
- a loading state before the first token
- an error state that is actionable, not decorative (§9)
- retry from the last user message
- copy message text

Multi-turn context within a session. Cross-session conversation history in `IndexedDB`.

**Not in the MVP:** message editing, branching, regeneration with a different model, side-by-side comparison.

---

## 6. File upload

| Format | Parser | Notes |
|---|---|---|
| `.pdf` | `pdf.js` | Text-based PDFs only. Scanned/image PDFs are rejected with a clear message — do not silently return nothing. |
| `.docx` | `mammoth` | |
| `.txt`, `.md` | direct | |

Requirements:

- Accepted formats are `.pdf`, `.docx`, `.txt`, `.md`. Anything else is refused by name.
- Parsing happens **in the browser**. The file is never uploaded anywhere. State this in the UI — it is a real privacy property and it is worth a line of copy.
- Size ceiling 10 MiB, enforced client-side against the file's declared size **before it is read**, with a readable error.
- Parsed text is injected into the prompt **in full** up to the inline budget, and only the remainder is chunked ( § `02_TECH_SPEC.md` §8.7) into the **session's** retrieval pool. Injection rather than retrieval-only is required by §8.3's "single structured call over an uploaded transcript" and by F5 — see §8.7 for why.
- When a file is longer than the budget, both the user and the model are told how much was read in. The agent must never present a partial read as a complete one.
- Uploaded content is attributed to its filename in the prompt.
- A parsing failure names the file and the reason. It never fails silently.
- An attached file is a complete message on its own: with a ready file in the box, Send works even if the user typed nothing, and the turn is sent as 「（见附件）」. Requiring a sentence would make handing over a document and asking 「看看这个」 two steps instead of one.
- Files are not persisted to the knowledge base.

---

## 7. Agent-scoped RAG

`office` retrieves only from `knowledge/office/`. `creator` only from `knowledge/creator/`. `fitness` only from `knowledge/fitness/`.

**Never mix.** This is structurally enforced — the browser only ever downloads the selected agent's index (`02_TECH_SPEC.md` §4).

The workspace must show **what was retrieved**, at least on demand. A user who can see the retrieved fragments understands why the answer is what it is; a user who cannot has to take it on faith. This is also what makes Demo 4 in `DEMO_SCRIPT.md` land.

---

## 8. Workflows

### 8.1 Progress UI

While running:

```
✓ Analyze positioning
✓ Define audience
◉ Define content pillars
○ Generate 30 topics
○ Generate titles
○ Build publishing calendar
○ Growth recommendations
```

Three states per step: pending, running, done. A failed step is shown as failed and the workflow halts with partial output preserved and a retry control.

### 8.2 Creator — 30-Day Content Plan **(required, flagship)**

**Input:** a goal in natural language — e.g. *"我想做一个小红书 AI 科技账号。"*

**Seven stages, seven model calls, each its own visible step:**

| # | Step | Output |
|---|---|---|
| 1 | Analyze positioning | 账号定位 — niche, angle, differentiation |
| 2 | Define audience | 目标受众 — profile, needs, where they already are |
| 3 | Define content pillars | 3–5 pillars, each with its rationale |
| 4 | Generate 30 topics | 30 concrete topics, distributed across the pillars |
| 5 | Generate titles | a title per topic |
| 6 | Build publishing calendar | topics mapped onto a 30-day schedule |
| 7 | Growth recommendations | execution advice, what to watch, what to adjust |

All seven must appear in the final output as distinct sections. Stage 7 is **not** optional.

### 8.3 Office — Meeting Summary

Single structured call over an uploaded transcript or pasted text.

Output sections, in this order: **Summary · Key Decisions · Action Items · Owners · Deadlines · Risks · Follow-up questions.**

Must not invent an owner or a deadline that is not present in the source. Where the source is silent, the section says so explicitly. This is acceptance criterion F5.

### 8.4 Fitness — Training Plan

Single structured call, driven by a short intake: goal, training experience, weekly frequency, available equipment, session length, any constraints the user volunteers.

Output sections: **Goal · Weekly Schedule · Session Detail · Lifestyle Suggestions · Progress Tracking · Safety Notes.**

`safety-edu` policy applies: educational and lifestyle framing only, no diagnosis, no promised outcomes. See `02_TECH_SPEC.md` §13.

### 8.5 Not in the MVP

The remaining seven agents' workflows. Do not build speculative workflow infrastructure for them.

---

## 9. Error handling

Every state below must have a designed, Chinese-language, actionable message. Not a toast reading "出错了".

| State | Required behaviour |
|---|---|
| No API key configured | Point to `/settings` with a one-line explanation of what BYOK means |
| Invalid key | Say the key was rejected by the provider; offer re-entry |
| Provider rate limit | Say to wait or switch model |
| Provider quota exhausted | Explain the limit is on the user's own provider account |
| Model unavailable | Offer the model list |
| Context too long | Suggest removing an attachment or starting fresh |
| CORS blocked | Explain and offer the proxy option (§ `02_TECH_SPEC.md` §6.2) |
| Network down | Distinct from CORS — see §6.6 of the tech spec |
| Retrieval failed | Continue **without** knowledge, and say so in the answer |
| File parse failure | Name the file and the reason |
| Empty response | Say the model returned nothing; offer retry |
| Stream interrupted | Preserve partial output; offer continue / retry |
| Storage unavailable | Continue session-only, with a visible notice |

A raw stack trace, a provider's JSON error body, or an English SDK error string must never reach the user.

---

## 10. Empty states

| Surface | State | Copy direction |
|---|---|---|
| Workspace, no conversation | Suggested prompts for this agent | Concrete tasks, not "Ask me anything" |
| Conversation, no key | Inline prompt to configure a provider | Explain BYOK in one sentence |
| RAG returned nothing | Not an error. The answer proceeds and notes it is answering from general knowledge. | |
| Upload with no file | Placeholder naming the accepted formats | |
| Settings, never configured | What BYOK is and why it exists | |
| Coming Soon agent | What this expert will do, and that it is not ready | Honest, not teasing |

---

## 11. AI identity transparency

Required, not decorative.

- The workspace states that the user is talking to an AI agent. Persistent, not a one-time modal that can be dismissed.
- Every agent answer is attributable to AI.
- Demo output shown in marketing material is labelled.

Applies to all agents; most load-bearing for `fitness` (health) and, later, `mental` (wellness) and `parenting` (minors). Required by China's anthropomorphic-AI rules and the EU AI Act's transparency provisions — and it costs almost nothing to implement. See `00_PRODUCT_BRIEF.md` §12.

---

## 12. Responsive

Desktop is the primary target. All four pages must also work on a phone — the traffic arrives from mobile social feeds, so a broken mobile layout strands the visitor at the door.

| Breakpoint | Behaviour |
|---|---|
| `lg`+ | Three-zone workspace, right rail visible |
| `md`–`lg` | Right rail collapses behind a toggle |
| `< md` | Single column; agent identity in the header; chat fills the viewport; input pinned above the keyboard |

---

## 13. Accessibility

Keyboard navigation throughout; focus visible on every interactive element; semantic buttons and landmarks; contrast meeting WCAG AA; labels on icon-only controls; reduced-motion respected for the workflow progress animation.

---

## 14. Definition of Done

The MVP is complete only when `06_ACCEPTANCE.md` passes in full. This PRD describes intent; the acceptance file is the test.
