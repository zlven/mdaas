# 07 — Roadmap and Decision Log

| Field | Value |
|---|---|
| Doc version | 1.0 |
| Last updated | 2026-09-26 |
| Note | §7 (the hosting migration trigger) is a commitment, not a suggestion. It records a risk the owner accepted **on condition that it be revisited**. |

---

## 1. Phase 0 — the demo (current)

**Goal:** a deployed product a stranger can use, at ¥0, with technical maintenance only.

**In scope:** nine agents, agent-scoped RAG, three workflows, BYOK across four provider types, four pages.

**Done when** `06_ACCEPTANCE.md` A–K pass. That now includes I13–I18, which the five later agents brought with them and which **have not been run** — so A–K does not currently pass, and the gap is exactly those six checks.

**Explicitly not in Phase 0:** accounts, payments, community, a safety-policy engine, workloads of any kind beyond the three.

---

## 2. Phase 1 — make the demo good, not bigger

The temptation after launching is to add agents. Resist it for one phase. A few agents that feel expert beat nine that feel generic, and the second is what the platform becomes if the knowledge bases are thin.

Ordered by value:

1. **Deepen the four knowledge bases.** They are the product. Add per-platform and per-industry material where a real practitioner would expect it.
2. **Memory.** Currently key–value notes. Make it useful — but keep it user-visible and user-deletable (`04_AGENT_SPEC.md` §6).
3. **Streaming workflow stages** in parallel where the stages are independent. `creator-30day` stages 4–6 can overlap.
4. **Prompt tuning driven by observed failures.** Keep a log of every answer that was wrong, generic, or fabricated, and fix the prompt against the log. Not against intuition.
5. **A public demo mode** — a canned example conversation for visitors without a key, so the product can be evaluated before the key step. This is the single biggest conversion lever for traffic arriving from a social feed.

Item 5 is worth its own note: the funnel currently asks a stranger to obtain an API key before seeing anything work. That is a large ask.

---

## 3. Phase 2 — ~~the remaining five agents~~ (done, with one obligation outstanding)

**This phase was pulled into Phase 0 by decision #16 and is complete as content.** All nine agents are written and enabled. What this section said about the three safety-critical ones was right, and it is worth keeping in view rather than deleting:

| Agent | Why it is different |
|---|---|
| `mental` | Crisis escalation. This was called "the highest-risk agent in the set". The boundary is written (`prompts/mental.md` §6.10) as a single threshold naming routes to help and no specific helpline. |
| `finance` | Must remain education-only. The boundary against personalised investment advice is written (`prompts/finance.md` §6). |
| `parenting` | Involves minors. `minor-safety` is written (`prompts/parenting.md` §6.8), including no diagnosis of a child and no punitive technique. |

**The outstanding obligation is verification, not content.** `06_ACCEPTANCE.md` I13–I18 are the human checks for these three. They are written and **have not been run**. Until they are, these three are *written and built*, not *verified*, and the roadmap's own earlier judgement — that `mental` "should be the last one shipped, not the first" — is best honoured by running I13 first rather than by treating the merge as the ship.

Note also what has **not** changed: there is still no policy engine, `lib/safety/` still does not exist, and `safetyPolicy` is still a label nothing reads (`02_TECH_SPEC.md` §13). Building one remains a Phase 1 candidate, and it would need its own acceptance criteria rather than being assumed to make I13–I18 pass.

The remaining Phase 2 work that is genuinely left is the original Phase 1 list — deepening the knowledge bases, the browser acceptance pass, and the agent-review checklist.

`study` left the `Coming Soon` group first: `content-default` was the whole of its safety need, so it needed no review to ship (`04_AGENT_SPEC.md` §4.4, decision #13).

---

## 4. Phase 3 — community

Deferred by decision, not by oversight.

The original goal included a small community for traffic. It is deferred because **the intended audience has no GitHub account** — parenting, fitness, and 小红书 audiences do not live on GitHub, so `giscus` or GitHub Discussions would be dead on arrival.

If community is revisited, the requirement is a Chinese-accessible, mobile-first surface with no account friction. That is a different build from a GitHub-based one, and it is not free.

**A lighter intermediate:** a feedback channel that does not require an account — a form, or a QR code to a group chat. This captures most of the value at almost none of the cost, and it is worth doing before a real community exists.

---

## 5. Phase 4 — money

Out of scope until there is traffic. Recorded so the direction is not lost, not as a plan.

The business plan (`project_plan/`) describes six revenue layers. Only two are reachable from this architecture without a server:

- **Knowledge packs** — sold as static content. No infrastructure.
- **Deployable agent packs** — sell the configuration and knowledge, self-hosted by the buyer. No infrastructure.

Everything else — subscriptions, usage metering, team seats — needs accounts and a backend, which means abandoning C1. That is a deliberate architectural break, not an incremental step, and this document is not the place to decide it.

---

## 6. Migrating off ¥0

The ¥0 constraint holds until one of the triggers below fires. When it does, the cost changes are small and the migration is cheap by design (`02_TECH_SPEC.md` §12).

### Option table, when the time comes

| Option | Cost | Notes |
|---|---|---|
| Cloudflare Pages / Vercel free tier | ¥0 | Current. Unreliable or blocked from mainland China. |
| HK / SG VPS | ~¥25/month | Accessible from the mainland without filing. Static files only — no ICP needed for a static site, though the position is not entirely settled. |
| Domestic OSS + ICP | ¥100–300/year | Fastest for mainland users. Requires ICP filing, which requires a registered entity in practice. |

### ⚠ The trigger — revisit this the moment any of the following is true

This was accepted as a known risk on the condition that it be recorded and revisited. It is recorded here.

1. **Any user reports being unable to open the site.** Not a hypothesis — a single real report from a real user is the trigger. The audience arrives from 小红书, 抖音, and 微信, where this will be the common case rather than the edge case.
2. **Traffic reaches the point where the free tier's bandwidth or build limits bind.**
3. **Any paid offering is added.** Taking money from mainland users through an inaccessible site is not viable.
4. **A provider integration requires a server-side component** that cannot be done client-side.

**On trigger 1, act within days, not weeks.** A visitor who cannot load the page is not a lost conversion — the traffic source is a feed where the post is seen once, so the loss is permanent.

### The unresolved question that must be answered before migrating

**ICP 备案 and 生成式人工智能服务备案 for a client-side-BYOK product is genuinely ambiguous.**

The architecture has no server, generates no content server-side, and stores no user data. It is closer to a static website than to a generative-AI service. But:

- Chinese hosting providers generally require ICP filing for a domain, and a foreign individual usually cannot complete one.
- Whether 生成式AI 备案 applies to a site that operates no model and holds no data is not something this document can settle.

**Do not guess. Get an answer from a Chinese lawyer or a filing agent before paying for domestic hosting**, because the answer determines whether option 3 is available at all, and filing takes weeks.

Until that question is answered, option 2 (HK/SG) is the realistic migration.

---

## 7. Why migration is cheap — the three seams

`02_TECH_SPEC.md` C3 requires that adding a backend later touches three interfaces and nothing else:

| Interface | What a backend would replace |
|---|---|
| `ModelGateway` | a server-side proxy holding the key, instead of the browser calling the provider |
| `Retriever` | a server-side index instead of static JSON + BM25 |
| `lib/store/*` | server-side accounts instead of `localStorage` / IndexedDB |

**Any change that spreads provider, retrieval, or storage logic outside these three seams has broken C3**, and the cost of the eventual migration goes up permanently. This is the constraint most likely to erode silently, because a client-side shortcut is always easier in the moment.

---

## 8. What would make this fail

Recorded so the failure modes are visible rather than discovered.

| Failure | Why it would happen | Early signal |
|---|---|---|
| **Generic agents** | Thin knowledge bases; prompts that describe a role instead of enforcing a standard | Users ask one question and leave |
| **The BYOK ask kills conversion** | The funnel requires an API key before any value is shown | Landing → settings drop-off |
| **Mainland inaccessibility** | §6 trigger 1 | A user says the page will not open |
| **Becoming a ChatGPT wrapper** | The knowledge base stops mattering; answers would be the same without it | Answers indistinguishable across agents |
| **Stale knowledge** | Content ages and nothing refreshes it | `updated:` dates drift past a year |
| **Safety failure in `fitness`** | The only live policy, and the one that must not slip | Any diagnosis or outcome promise in output |
| **Scope creep into the SRS** | Someone reads `project_plan/` and builds the server | FastAPI appears in the dependency list |

---

## 9. Decision log

Each entry records a decision and **why**, so it is not relitigated by a future session that lacks the context.

| # | Decision | Why | Date |
|---|---|---|---|
| 1 | Client-side architecture; no backend | The ¥0 constraint. BYOK is not merely a margin strategy — it is what makes zero infrastructure cost possible at all. | 2026-09-26 |
| 2 | `docs/` outranks `project_plan/` | The business plan and SRS describe a paid, server-side product. Building that in Phase 0 is a defect, not ambition. | 2026-09-26 |
| 3 | Community deferred | The target audience has no GitHub account; a GitHub-based community would be dead on arrival. | 2026-09-26 |
| 4 | Three functional agents, seven `Coming Soon` | Ten real agents is not a Phase 0 scope. Showing ten and shipping three is honest; showing three is a smaller product. **Revised by #12/#13 — of nine agents, four are functional and five are `Coming Soon`. Superseded by #16 — all nine are functional.** | 2026-09-26 |
| 5 | The seven get no prompts | Writing them would be speculative surface area, and shipped-but-unverified safety policies for `mental` and `parenting` would carry obligations nothing checks. **Now five — #13 wrote `study`'s, and it needs no policy beyond `content-default`. Superseded by #16 — all five are written. The second half of the reason is not superseded: the obligations are now shipped and still unchecked, which is what I13–I18 exist to close.** | 2026-09-26 |
| 6 | BM25, not embeddings | Embeddings require an embedding API, which requires a key and a server-side cost. BM25 runs in the browser for ¥0. | 2026-09-26 |
| 7 | Structural knowledge isolation | Fetching only the selected agent's index makes cross-agent retrieval impossible by construction. A filter would be a runtime promise that a refactor can break. | 2026-09-26 |
| 8 | Intent-based model profiles, not temperature | `temperature` was removed from current Anthropic models and returns a 400. See `02_TECH_SPEC.md` §6.4. | 2026-09-26 |
| 9 | Hosting stays on the free tier despite the China access risk | Accepted on the condition that §7's trigger is honoured. | 2026-09-26 |
| 10 | `creator-30day` has 7 stages | `01_PRD.md` and the acceptance list disagreed; 增长建议 was missing from the latter. | 2026-09-26 |
| 11 | Knowledge files differ in naming across agents | `office`/`fitness` use English kebab-case; `creator` uses numbered Chinese names. Cosmetic — the build globs `**/*.md` — but normalise it in Phase 1. | 2026-09-26 |
| 12 | `hair` (头皮毛发健康专家) removed; the roster is nine | A product judgement, not a scope cut: the subject read as jarring beside the other eight. The count was never the argument — ten agents with four working is as honest as nine with four. *(Superseded in part by #16: of nine, nine are now functional.)* | 2026-09-27 |
| 13 | `study` (考研公考学业规划) promoted out of `Coming Soon` | Its prompt and knowledge base are written, and `content-default` is the whole of its safety need. It is the first agent added since C4 was written, and it exercised that test exactly: one config, one prompt, one knowledge directory, **no registry edit** — it was already registered. | 2026-09-27 |
| 14 | A workflow step declares a prompt; the engine owns the model call | `02_TECH_SPEC.md` §10's sketch is not implementable — `ModelGateway` is not a type, and its `WorkflowContext` has no credentials, model, signal or system prompt. Injecting the call (`StepCaller`) is what makes the engine testable in Node with a scripted generator, which is how F3–F6 are checked at all. | 2026-09-27 |
| 15 | The three workflows all run on that one engine, including the two single-call ones | `office-meeting-summary` and `fitness-plan` are one-step workflows rather than a second "structured call" path. F1 asks every functional agent to expose a workflow, so a parallel path would buy a shorter array and cost a second copy of the failure, retry and persistence surfaces. | 2026-09-27 |
| 16 | The five `Coming Soon` agents are written and enabled — the roster is nine functional | An owner decision, taken with the cost stated. It supersedes #4's "four functional" and #5's "the five get no prompts". It does **not** supersede the reason #5 existed: `mental`, `finance` and `parenting` carry safety boundaries that nothing in the runtime enforces, so `06_ACCEPTANCE.md` I13–I18 were added in the same change and are **unrun**. The five shipped as content; the three ship as *verified* only when someone runs those checks against a real browser and a real key. | 2026-09-27 |
