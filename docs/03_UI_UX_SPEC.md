# 03 — UI / UX Specification

| Field | Value |
|---|---|
| Doc version | 1.0 |
| Last updated | 2026-09-26 |
| Why this file exists | Coding agents reliably produce correct code and a Bootstrap admin dashboard. This file exists to prevent that. |

---

## 1. The failure mode to avoid

Left unspecified, this build ends up as **a generic admin dashboard wrapped around a ChatGPT clone** — grey cards, a left nav, a centred chat column, default blue buttons. That deliverable fails the project's only goal, which is to make a visitor from a social feed think *"this is a real product."*

The code can be perfect and the project can still fail here. Treat the visual spec as functional requirements.

**Target feeling:** intelligent, calm, premium, professional.

**References:** Linear, Notion, Raycast, Arc, modern AI products.

**Forbidden:** academic-project styling; traditional admin dashboards; left sidebar navigation as the primary structure; excessive gradients; excessive glassmorphism; drop-shadow-heavy "card floating in space" styling; stock-photo hero imagery; generic Bootstrap/Tailwind-default appearance; purple-to-pink AI clichés.

---

## 2. Design tokens

Concrete values. Deviating requires a reason.

### Colour

A near-monochrome interface. **The interface is not where colour lives — the agents' icons are.** Restraint here is what reads as premium.

```css
--color-bg:            #FAFAF9;   /* app background — warm near-white, not pure white */
--color-surface:       #FFFFFF;   /* cards, panels */
--color-surface-alt:   #F4F4F5;   /* subtle fills, code blocks, hover */
--color-line:          #E7E7E4;   /* 1px hairlines */
--color-line-strong:   #D4D4D1;   /* focus rings on containers, dividers that must read */

--color-ink:           #18181B;   /* primary text */
--color-ink-muted:     #6B6B70;   /* secondary, captions */
--color-ink-subtle:    #9A9AA0;   /* placeholders, disabled */

--color-accent:        #2F5D62;   /* single restrained accent — deep teal */
--color-accent-hover:  #26494D;
--color-accent-fg:     #FFFFFF;

--color-success:       #3F7A4E;
--color-warning:       #A8702B;
--color-danger:        #B3453C;
```

**These are the exact names in `app/globals.css`.** The project uses Tailwind v4, where tokens are declared in CSS under `@theme` — there is no `tailwind.config.js`. A token named `--color-ink` produces the utilities `text-ink`, `bg-ink`, and `border-ink`.

The names are chosen for the utility they generate: `--color-ink` gives `text-ink`, where `--color-text` would give the stuttering `text-text`; likewise `--color-line` gives `border-line`. Do not rename one side without the other — the CSS and this table must stay identical, and `06_ACCEPTANCE.md` J1 checks that components use tokens rather than ad-hoc hex values.

Rules:

- **One accent colour.** No second brand colour.
- Use `--accent` for the primary action on a screen and for the active state of anything. Nowhere else.
- Status colour only on genuine status: `Coming Soon` badge, workflow failure, error. Not for decoration.
- Each agent gets a tint for its **icon plate only** — a 40×40 rounded square at ~12% opacity of a per-agent hue. Everything else on the card stays neutral.

Dark mode is **out of scope for the MVP**. Do not implement it. Do implement the tokens above so it is a later swap, not a rewrite.

### Type

```css
--font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI",
             "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei",
             "Noto Sans SC", sans-serif;
--font-mono: "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
```

**The Chinese fallbacks are not optional.** This is a Chinese-language product; a stack that resolves to a Latin font with a fallback CJK face produces inconsistent weight and spacing across a mixed-script page.

| Role | Size / line-height | Weight | Use |
|---|---|---|---|
| Display | 48 / 1.1 | 600 | Landing hero only |
| H1 | 30 / 1.3 | 600 | Page titles |
| H2 | 20 / 1.4 | 600 | Section headings, agent name |
| H3 | 16 / 1.5 | 600 | Card titles, message headings |
| Body | 15 / 1.7 | 400 | Default |
| Small | 13 / 1.6 | 400 | Captions, metadata |
| Micro | 12 / 1.4 | 500 | Badges, tags |

Two rules that matter specifically for Chinese text:

- **Body line-height is 1.7, not 1.5.** Chinese glyphs are full-height and dense; 1.5 reads as cramped and is the single most common thing that makes a Chinese UI look unfinished.
- **Do not letter-space CJK.** Tracking is for Latin caps. Applied to Chinese it looks broken.

### Space and shape

```css
--radius-sm: 6px;    /* inputs, small controls */
--radius:    10px;   /* buttons, cards */
--radius-lg: 16px;   /* panels, modals */
```

Spacing scale: `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96`. Use the scale; do not invent values.

**Whitespace is the primary premium signal.** Landing sections get generous vertical padding (96px+ desktop). When in doubt, add space rather than a border.

### Elevation

Prefer a **1px border over a shadow.** Shadows are reserved for genuinely floating layers — dialogs, dropdowns, popovers.

```css
--shadow-pop: 0 4px 16px rgba(24, 24, 27, 0.08),
              0 1px 3px  rgba(24, 24, 27, 0.06);
```

Cards get a border, not a shadow. On hover: border darkens to `--border-strong`, and optionally a 1px lift. Not a glow, not a scale transform.

### Motion

150–200 ms, `ease-out`. Animate only `opacity` and `transform`. Respect `prefers-reduced-motion`.

---

## 3. Landing page

### Hero

```
AI SUPER EXPERT

你的 AI 专家团队，
覆盖工作与生活的每一个领域。

10 位垂直领域专家。一个智能工作台。

[ 浏览专家 ]        [ 了解 BYOK ]
```

Then, immediately below:

```
AI 专家矩阵
```

and the grid of 10 cards.

Rules:

- No hero illustration, no stock imagery, no abstract 3D shapes. Type and space.
- The CTA is one primary button plus one text link. Not three buttons.
- The grid must begin above the fold on a 1440×900 screen — it is the product, and it is the argument.

### Below the grid

A four-beat strip: **选专家 → 给任务 → 查知识 → 出结果**. This is the product thesis; it belongs on the landing page, compressed to icons and one line each.

Then the BYOK block, then the footer.

---

## 4. Agent cards

Cards are **product modules**, not dashboard widgets.

```
┌───────────────────────────┐
│  ┌────┐                   │
│  │ 💼 │                   │   ← 40×40 icon plate, tinted, radius 10
│  └────┘                   │
│                           │
│  AI 全能办公专家            │   ← H3, Chinese name, primary
│  AI Office Expert          │   ← Small, muted, secondary
│                           │
│  会议 · 报告 · PPT          │   ← capability tags, Micro
│                           │
│  ● 可用                    │   ← status
│                           │
│  打开专家 →                 │
└───────────────────────────┘
```

- Grid: 1 column mobile, 2 at `sm`, 3 at `lg`, 4 at `xl`. Gap 16–20px.
- The **whole card** is the click target for available agents.
- `Coming Soon` cards: 60% opacity, `cursor: default`, **no hover state at all**, no arrow. The absence of the hover response is what communicates "inert". Do not rely on the badge alone.
- Available status: a small filled dot in `--success` plus the word. Not a coloured pill badge.
- Card height is uniform within a row — capability tags must not cause ragged rows. Clamp or fix the tag row height.

---

## 5. Agent workspace

Three zones.

```
┌──────────────────────────────────────────────────────────────┐
│ ← 返回      💼 AI 全能办公专家          [设置]  [清空对话]     │
├────────────┬────────────────────────────────┬────────────────┤
│            │ ▸ 我的档案 · 已填 3 项          │   能力          │
│  Agent     │ ▸ 工具 · 会议成本               │   ────         │
│  identity  │ ──────────────────────────────  │   知识库        │
│            │   ┌──────────────────────┐     │   工具          │
│  icon      │   │ user message         │     │   工作流        │
│  description│  └──────────────────────┘     │                │
│            │                                │   本次检索       │
│  tags      │   ┌──────────────────────┐     │                │
│            │   │ assistant message    │     │   ────         │
│            │   │ (streaming)          │     │   · chunk 1    │
│            │   └──────────────────────┘     │   · chunk 2    │
│            │                                │                │
├────────────┴────────────────────────────────┴────────────────┤
│ [📎 附件] [⚡ 工作流]                              [ 发送 → ] │
└──────────────────────────────────────────────────────────────┘
```

| Zone | Width | Contents |
|---|---|---|
| Left rail | 240px | Icon, names, description, capability tags |
| Centre | flexible | Conversation, max-width ~720px, centred |
| Right rail | 280px | Capabilities, knowledge, tool names, workflows, **and what was retrieved this turn** |

Both rails collapse below `lg`. The **centre column never exceeds ~720px** — full-width prose on a 1440px monitor is unreadable.

### The profile and tools strips

Above the conversation, in the centre column:

```
▸ 我的档案 · 已填 3 项
▸ 工具 · 会议成本
```

- Each is a `<details>` collapsed to a single line by default — the same interaction as the retrieved-context panel, which makes keyboard operation free.
- **Centre column, not the right rail.** The rail describes the agent; these are things the user operates. The rail goes on listing tool *names* as description.
- **Mounted exactly once.** They hold input state, and the narrow-screen adaptation *duplicates* the rail rather than moving it, so a component with drafts mounted twice has two independent drafts — typing on a narrow viewport and then widening the window would silently discard the input. The centre column is the only zone present at every breakpoint, so it is the only correct home.
- **Loading is not empty.** While the profile is being read the strip says 读取中. Rendering the empty state first and filling it in a frame later tells the user their data is gone.
- The profile form reuses §8's field styling and carries a two-step 清空档案 confirmation. Its footer states that the profile is stored in this browser, does not sync across devices, and may be overwritten when several tabs are open.
- When the browser refuses storage, a **neutral**-coloured notice appears inside the strip — not `--danger`. The user has done nothing wrong, and a permanently-red banner teaches people to ignore red.
- When the profile is empty and there is no conversation yet, the empty state gains one line above the suggested prompts inviting the user to fill it in. This is the product's onboarding moment, not chrome.

### The retrieved-context panel

This is a differentiator, not chrome. It shows which knowledge fragments informed the current answer, collapsed by default, expandable to the chunk text and its source file.

It makes the RAG real to the visitor. Without it, "each agent has its own knowledge base" is an unverifiable claim. It is what Demo 4 in `DEMO_SCRIPT.md` shows.

### Message rendering

- User messages: right-aligned, `--surface-alt` fill, max-width 80%.
- Assistant messages: full width of the centre column, no bubble — just text on the background. Bubbles around long-form markdown look wrong.
- Markdown: tables get horizontal scroll on narrow screens; fenced code gets `--surface-alt`, mono, and a copy control.
- Streaming: a caret at the end of the text. Not a spinner replacing the message.
- **The AI identity notice sits at the top of the conversation and stays there.** See §9.

---

## 6. Chat input

Prominent, and it grows with content up to about six lines.

```
┌──────────────────────────────────────────────────────────────┐
│  想让这位专家做什么？                                          │
│                                                              │
│                                                              │
│  [📎 附件]  [⚡ 工作流]                          [ 发送 → ]   │
└──────────────────────────────────────────────────────────────┘
```

- Placeholder is a concrete invitation, never "请输入内容".
- Attachment and workflow controls sit **inside** the input container, below the textarea.
- Enter sends; Shift+Enter newlines. On mobile, Enter newlines and Send is a button.
- Disabled state (no key configured) keeps the input visible and replaces the placeholder with a prompt to configure a provider, plus a link. **Do not hide the input** — hiding it makes the product look broken.
- Attachment chips render above the textarea with a remove control and the parsed-character count. Character count, not file size — what matters is whether it fit.

---

## 7. Workflow visualisation

Inline in the conversation where the workflow was invoked, not a modal.

```
⚡ 30 天内容计划

✓  分析账号定位
│
✓  定义目标受众
│
◉  设计内容支柱          ← running
│
○  生成 30 个选题
│
○  生成标题
│
○  生成发布日历
│
○  增长建议
```

- A vertical rule connects the steps; the marker sits on the rule.
- Running step: filled accent marker, label in `--text`, subtle pulse. The pulse must stop under `prefers-reduced-motion`.
- Done: check, muted label.
- Failed: danger marker, error line, **and a retry control on that step**, with prior steps' output preserved and visible.
- Completed steps are individually expandable to their output. Users should not have to wait for all seven stages to read the first.

When the workflow completes, the seven sections render as one structured result beneath — this is the artefact the user came for and the thing they will screenshot.

---

## 8. Settings

Deliberately plain. Four fields and a status line.

```
模型服务商      [ OpenAI          ▾ ]
API Key        [ ••••••••••••••  ]  [验证]
模型            [ gpt-4o          ▾ ]
代理地址（可选） [ https://...     ]

● 已连接
```

- The saved key renders masked as `sk-…f3a2`. **Never** the full value. If the field is re-focused, it must not reveal the key.
- The Verify action performs a real minimal call (§ `05_API_SPEC.md` §5) and reports the result inline.
- The optional proxy field carries one line explaining what it is for and that it stores nothing.
- An honest disclosure block below the form: the key is stored in this browser only, is not encrypted, never reaches the platform's servers, and does not sync across devices. State this plainly. Do not dress it up as a feature.
- A destructive **Delete key** action, with confirmation.

Everything else the SRS describes for settings — team, permissions, audit, billing — is out of scope and must not appear.

---

## 9. AI identity transparency

Platform-wide, and it must be impossible to miss:

- The workspace conversation header carries a persistent line: **你正在与 AI 智能体对话。**
- Every assistant message is attributable to the agent, and the agent is labelled as AI in its identity block.
- The landing page states it once, plainly.
- Marketing screenshots used in `DEMO_SCRIPT.md` must carry the same label.

Do not implement this as a dismissible first-run modal. A dismissed disclosure is not a disclosure. See `01_PRD.md` §11 and `02_TECH_SPEC.md` §13.

---

## 10. Copy voice

Concise, direct, second person. Chinese throughout. The product talks like a competent colleague, not a system.

| Do not write | Write |
|---|---|
| 欢迎使用我们的 AI 智能体平台系统 | 选一位专家，给它一个任务 |
| 请输入您的需求 | 想让这位专家做什么？ |
| 操作成功 | 已保存 |
| 抱歉，出现了一个错误 | 模型服务商拒绝了这次请求，请检查 API Key |
| 暂无数据 | 还没有对话。试试下面这些任务 |
| 该功能即将上线 | 这位专家还在开发中 |

Rules:

- No exclamation marks.
- No "我们" unless the sentence genuinely needs a first person.
- No emoji in UI copy. Agent icons are emoji; interface copy is not.
- Error messages say what happened **and what to do**. "出错了" is not an error message.
- English product names keep their English spelling; surrounding prose is Chinese.

---

## 11. Accessibility

| Requirement | Detail |
|---|---|
| Keyboard | Every interactive element reachable and operable by keyboard. The workflow steps and retrieved-context panel are keyboard-expandable. |
| Focus | Visible focus ring on all interactive elements — `2px` `--accent` at `2px` offset. Never `outline: none` without a replacement. |
| Semantics | Real `<button>`, `<nav>`, `<main>`, `<dialog>`. Live region (`aria-live="polite"`) for streaming text and workflow step transitions. |
| Contrast | Body text ≥ 4.5:1. `--text-muted` on `--bg` clears it; `--text-subtle` is for placeholders and disabled states only. |
| Labels | Icon-only controls carry `aria-label` in Chinese. |
| Motion | `prefers-reduced-motion` disables the streaming caret, the workflow pulse, and every transition. |
| Zoom | Usable at 200% with no loss of function or content. |
