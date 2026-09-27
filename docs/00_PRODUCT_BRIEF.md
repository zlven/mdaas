# 00 — Product Brief

| Field | Value |
|---|---|
| Product | AI Super Expert / AI 超级专家智能体矩阵平台 |
| Doc version | 1.0 |
| Last updated | 2026-09-26 |
| Audience | **Coding agents.** Written to be read mechanically, not skimmed. |
| Language | English (developer docs). See §11 for the per-artifact language rule. |

---

## 0. Document precedence — READ THIS FIRST

This repository contains **three** sets of planning documents. They disagree about the technology stack, because they were written at different stages. The order of authority is:

| Priority | Source | What it governs | Status |
|---|---|---|---|
| **1 (highest)** | `docs/` (this folder) | Architecture, scope, acceptance criteria | **Authoritative. Binding.** |
| 2 | `AGENT_CODING_PROMPT.md` | How the coding agent should work | Binding on process |
| 3 | `project_plan/demo_prompt.md` | Original brief; source of much of this folder's text | Superseded where it conflicts |
| 4 (lowest) | `project_plan/软件规格说明书.md` (SRS V1.0) | **North-star vision of the full commercial platform** | NOT a build target for the MVP |
| 4 (lowest) | `project_plan/AI 超级专家智能体矩阵平台.md` | Business plan | Context only |

### The one conflict you must not get wrong

`project_plan/软件规格说明书.md` §9.2 and `project_plan/demo_prompt.md` §02_TECH_SPEC both specify a **server-side architecture**:

- FastAPI backend
- Encrypted server-side storage of BYOK API keys
- PostgreSQL + pgvector
- Multi-tenancy, RBAC, audit logging

**None of that is in scope for the MVP, and building it would be a defect, not progress.** The MVP is a **static site with no backend**. See `02_TECH_SPEC.md` §1 for the binding constraints and the reasoning.

---

## 1. One sentence

AI Super Expert is a multi-domain vertical AI Agent platform that turns general-purpose LLMs into specialized expert agents through domain prompts, domain knowledge, workflows, and user context.

中文：通过领域 Prompt、专属知识库、Agent Workflow 和用户上下文，将通用大模型封装成垂直专家智能体的平台。

---

## 2. What this is not

Not a general chatbot. Not a ChatGPT wrapper. The product concept:

```
One Platform
    ↓
Multiple AI Experts
    ↓
Domain Knowledge
    ↓
Workflow
    ↓
Business Result
```

---

## 3. Stage goal (2026-09)

This is **not** an attempt to build the commercial platform described in the SRS.

The goal is a **demo + a small community around it, to attract traffic** — a working, polished, zero-cost, deployable site that demonstrates the product concept well enough that a visitor immediately understands it.

Two hard constraints, both from the project owner:

| Constraint | Consequence |
|---|---|
| **Infrastructure cost must be ¥0** | No always-on server, no database, no server-side key storage. Static hosting on a free tier. |
| **Maintenance is technical only** | Nothing that requires daily human operation. No moderation queue, no community to police. |

A third decision, taken at the same time: **no community features in the MVP.** A community would require a backend and/or daily operations, contradicting both constraints above. Community comes later, if traffic justifies it.

### What this means for scope

The demo must prove five consecutive actions:

> **Pick an expert → give it a task → it consults its own knowledge → it runs a workflow → it produces a professional result.**

If those five steps work, the project has crossed from "AI chat demo" to "Vertical Agent Platform demo." Nothing else in the MVP matters as much.

---

## 4. The nine agents

The UI shows all nine. **Four are functional**; five are visible but marked `Coming Soon`.

| # | ID | Name | Status |
|---|---|---|---|
| 1 | `office` | 💼 Office Productivity Expert | **Functional** |
| 2 | `creator` | 📱 Creator Growth Expert | **Functional** |
| 3 | `fitness` | 🏋 Fitness & Lifestyle Expert | **Functional** |
| 4 | `study` | 📚 Study Planning Expert | **Functional** |
| 5 | `mental` | 🧠 Mental Wellness Expert | Coming Soon |
| 6 | `finance` | 💰 Personal Finance Education Expert | Coming Soon |
| 7 | `style` | 👗 Style & Outfit Expert | Coming Soon |
| 8 | `career` | 🎯 Career & Interview Expert | Coming Soon |
| 9 | `parenting` | 🧒 Parenting Expert | Coming Soon |

**A `Coming Soon` agent must not open a chat that pretends to work.** It may show its description, capabilities, and a disabled state. See `AGENT_CODING_PROMPT.md` §7.

### Why these four first

- `office` — the B2B flagship; the clearest ROI story.
- `creator` — carries the most impressive single workflow (30-day content plan).
- `fitness` — the clearest consumer use case, and the one that exercises the safety-policy machinery (health disclaimers).
- `study` — the largest single audience the four address, and the second one whose prompt carries a safety boundary of its own: sustained low mood or any self-harm signal stops the planning answer and hands off to a professional.

---

## 5. Core architecture

```
Browser (static site, no backend)
   ↓
Agent Registry            config-driven, no hard-coded agents
   ↓
Agent Runtime             prompt assembly + retrieval + workflow
   ├── Model Gateway       provider adapters, user's own key
   ├── RAG                 in-browser retrieval over domain knowledge
   ├── Tools               client-side only
   └── Workflow            multi-step, progress visible in UI
   ↓
User's own LLM provider (OpenAI / Anthropic / compatible)
```

The **only** optional server component is a stateless request-forwarding proxy on Cloudflare Workers' free tier, needed because several Chinese model providers block browser-origin requests (CORS). It forwards and stores nothing. See `02_TECH_SPEC.md` §6.

---

## 6. BYOK — and why it is load-bearing here

BYOK (**B**ring **Y**our **O**wn **K**ey) is normally a margin strategy: the user pays for their own inference, so the platform's cost does not scale with usage.

**In this project BYOK is also what makes the ¥0 constraint possible at all.** Because the user's key lives in their browser and requests go from the browser straight to the provider, the platform needs no backend, stores no secrets, and carries no key-custody liability.

The honest consequences — which the product must not hide from the user:

1. The key is stored in the user's browser (`localStorage`). It is **not** encrypted at rest. This is a weaker guarantee than server-side encrypted storage. It is acceptable here because the key never leaves the user's machine and is never sent to the platform.
2. Chat history and memory live in `IndexedDB`. **They do not sync across devices.** If the user clears site data, they are gone. The UI must say so.
3. Several Chinese providers (DeepSeek, Kimi, Doubao) do not permit browser-origin requests. Those users need the optional proxy.

The UI must never display a saved key in full, and the platform must never log one. See `02_TECH_SPEC.md` §7.

---

## 7. RAG

Each functional agent retrieves from **its own** knowledge namespace, and never from another's:

```
knowledge/
├── office/
├── creator/
├── fitness/
└── study/
```

Retrieval happens **in the browser**, over knowledge shipped with the site as static assets. No vector database, no embedding API. `02_TECH_SPEC.md` §8 specifies the mechanism.

Cross-agent retrieval is a **correctness bug**, not a tuning issue. Acceptance criteria E4/E5 test it explicitly.

---

## 8. Workflow

At least one multi-step workflow must run end-to-end with **visible progress**:

### Creator — 30-Day Content Plan

```
Analyze positioning
   ↓
Define audience
   ↓
Define content pillars
   ↓
Generate 30 topics
   ↓
Generate titles
   ↓
Build publishing calendar
   ↓
Growth recommendations
```

Seven stages. The workflow's final output must contain all seven, each as its own section. (An earlier draft of the acceptance criteria listed only six, omitting Growth Recommendations — that was an error, corrected in `06_ACCEPTANCE.md`.)

A workflow is not a single chat completion. The seven stages are executed as distinct model calls, and the UI shows which stage is running.

---

## 9. Design philosophy

The UI must read as a modern AI product. The single most common failure mode for this kind of build is ending up with a Bootstrap admin dashboard wrapped around a ChatGPT clone. That is a failed deliverable.

**Target:** premium, minimal, modern, AI-native, commercial SaaS. References: Linear, Notion, Raycast.

**Avoid:** academic-project styling, traditional admin dashboards, excessive gradients, excessive glassmorphism, generic chatbot appearance, clutter.

Full specification in `03_UI_UX_SPEC.md`.

---

## 10. Guiding principles

1. **AI is not answering questions. AI is executing specialized work.** Every screen should reinforce this.
2. **A configuration change should be able to add an agent.** Adding the 10th agent must not require editing runtime code.
3. **Do not fake functionality.** A button that does nothing is worse than no button. Mark it `Coming Soon` or remove it.
4. **Never claim production readiness that has not been verified.**
5. **Safety policies are product features, not disclaimers.** See §12.

---

## 11. Language rule

Each artifact is written in the language of its consumer. This is deliberate, not sloppiness.

| Artifact | Language | Consumer |
|---|---|---|
| `docs/*.md` | English | Coding agents |
| `AGENT_CODING_PROMPT.md` | English | Coding agents |
| `prompts/*.md` | Chinese | The LLM at runtime — its output must be Chinese, and the owner must be able to edit it |
| `knowledge/**/*.md` | Chinese | Retrieved and injected into the prompt; must match the user's query language |
| `README.md` | Chinese | Humans (GitHub visitors, community, investors) |
| `DEMO_SCRIPT.md` | Chinese | A spoken script for a Chinese-speaking presenter |
| `project_plan/*` | Chinese | Historical, unchanged |

---

## 12. Safety and compliance — read before touching agent prompts

Four of the nine domains (health, mental wellness, finance, minors) carry real regulatory and ethical constraints. These are not boilerplate:

- **Health agents** (`fitness`): education and lifestyle guidance only. No diagnosis, no treatment, no prescriptions, no promised outcomes.
- **Mental wellness** (`mental`): requires a crisis-escalation policy with distinct risk tiers. Must never claim to replace a psychologist or doctor.
- **Finance** (`finance`): financial *education*, never financial *advice*. No stock picks, no return guarantees.
- **Minors** (`parenting`): age gating, data minimization, no emotional dependency, no AI-driven diagnosis of a child.

Two obligations apply platform-wide:

1. **AI identity transparency.** The UI must make clear that the user is interacting with an AI agent. This is required by China's rules on anthropomorphic AI interaction services and by the EU AI Act's transparency provisions. It is also nearly free to implement, and it is the cheapest visible difference between this product and a wrapper. Do not treat it as optional.
2. **User's own key and data.** The platform never sees them.

Before any public launch in mainland China, the service-registration question for generative AI must be resolved. In a client-side BYOK model where inference runs on the user's own provider account, it is genuinely unclear who the service provider is. **Flag this to the owner; do not assume it is settled.**

---

## 13. Document map

| File | Contents |
|---|---|
| `00_PRODUCT_BRIEF.md` | This file. Frames everything. |
| `01_PRD.md` | Pages, features, workflows, MVP scope and non-goals |
| `02_TECH_SPEC.md` | **Binding architecture.** Stack, BYOK, RAG, storage, migration path |
| `03_UI_UX_SPEC.md` | Visual language, layouts, copy voice, accessibility |
| `04_AGENT_SPEC.md` | The nine agents, and the rules for writing agent prompts |
| `05_API_SPEC.md` | Provider adapter contract + optional proxy contract |
| `06_ACCEPTANCE.md` | Definition of Done. Every item is testable. |
| `07_ROADMAP.md` | What comes after the demo, and the trigger for each step |
| `AGENT_CODING_PROMPT.md` | How the coding agent should work, phase by phase |
| `DEMO_SCRIPT.md` | Six-part demo walkthrough |
