# 03 — UI / UX Specification

| Field | Value |
|---|---|
| Doc version | 1.0 |
| Last updated | 2026-09-27 |
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

and the grid of 9 cards.

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
- `Coming Soon` cards: 60% opacity, `cursor: default`, **no hover state at all**, no arrow. The absence of the hover response is what communicates "inert". Do not rely on the badge alone. *(No agent renders in this state today — every card is 可用. The spec stands so that staging the next agent is a config change and not a design decision.)*
- Available status: a small filled dot in `--success` plus the word. Not a coloured pill badge.
- Card height is uniform within a row — capability tags must not cause ragged rows. Clamp or fix the tag row height.

---

## 5. Agent workspace

Three zones.

```
┌──────────────────────────────────────────────────────────────────┐
│ ← 返回      💼 AI 全能办公专家               [设置]  [清空对话]  │
├────────────┬────────────────────────────────────┬────────────────┤
│ Agent      │ [会议成本] [口播时长]              │ 我的档案       │
│ identity   │ ┌────────────────────────────────┐ │ 身高(cm)       │
│            │ │ 按人数、时长和平均时薪，算出   │ │ [ 175      ]   │
│ icon       │ │ 这场会实际花掉多少钱。         │ │ 补充说明       │
│ description│ │ ────────────────────────────── │ │ [          ]   │
│            │ └────────────────────────────────┘ │ [ 清空档案 ]   │
│ tags       │   ┌────────────────────────┐       │ ────────────   │
│            │   │ user message           │       │ 我的记录 1 条  │
│ 能做什么   │   └────────────────────────┘       │ [体重] [睡眠]  │
│            │   ┌────────────────────────┐       │ ╱‾╲__╱‾╲       │
│ 知识库     │   │ assistant message      │       │ ☑ 每次都带上   │
│            │   │ (streaming)            │       │ ────────────   │
│ 工具       │   └────────────────────────┘       │ 资料夹 2/5     │
│            │                                    │ 简历.pdf  ✕    │
│ 工作流     │                                    │ ☑ 每次都带上   │
│            │                                    │ ────────────   │
│            │                                    │ 本次检索       │
│            │                                    │ · chunk 1      │
│            │                                    │ · chunk 2      │
├────────────┴────────────────────────────────────┴────────────────┤
│ [📎 附件] [⚡ 工作流]                                 [ 发送 → ]  │
└──────────────────────────────────────────────────────────────────┘
```

| Zone | Width | Contents |
|---|---|---|
| Left rail | 240px | Icon, names, description, capability tags, **能做什么**, **知识库**, **工具**, **工作流** |
| Centre | flexible | Conversation, max-width ~720px, centred |
| Right rail | 280px | **The profile**, **我的记录**, **the 资料夹**, and what was retrieved this turn |

Both rails collapse below `lg`. The **centre column never exceeds ~720px** — full-width prose on a 1440px monitor is unreadable.

**The split between the rails is the agent on the left and everything else on the right.** The left rail describes the expert: its name, what it can do, what it knows, which tools and workflows it carries. The right rail holds what the user authored and what happened on this turn.

That rule is not a preference, because the right rail's order is load-bearing: it reads top to bottom in the sequence `lib/rag/context.ts` assembles the request — the profile block first, the series summaries inside it, then the reference block the 资料夹 is numbered into, with this turn's retrieval last. A describing section above the profile would break that order, and one below it would separate the profile from the 资料夹. So the four describing sections have exactly one place they can sit, and the left rail is it.

It was the other way round until the owner said the right rail held too much. It held eight sections, four of them one-line descriptions of the agent that belong beside its name — and one of those four was a duplicate: the capability tags under the description and the 「能做什么」 line were the same array printed twice (`components/agent/AgentRails.tsx`).

### The tools strip — centre column

Above the conversation, in the centre column. **One line, however many tools the agent declares:**

```
┌──────────────────────────────────────────────┐
│ [ 会议成本 ] [ 口播时长 ] [ 食物热效应 ]       │
└──────────────────────────────────────────────┘
```

The three chips above are **illustrative, not a state the product ships**. Ten tools exist, but they are spread one per agent — every card's strip holds exactly one chip — so the one-line-at-any-count property this section designs for has never been rendered above one. The sketch is kept because it is what the layout must survive; `06_ACCEPTANCE.md` D11 is the check that makes it real, and it still requires temporarily adding tools to some agent's array.

```
┌──────────────────────────────────────────────┐ ← selected tool's panel
│ 按人数、时长和平均时薪，算出这场会花掉多少钱。 │ ← Small, --ink-muted
│ ──────────────────────────────────────────── │
│ 参会人数（人） 会议时长（分钟） 平均时薪（元） │
└──────────────────────────────────────────────┘
```

- **The selector is a row of `<button>`s, not `<details>`.** One disclosure per tool cannot scale: at two lines each, three tools is six lines of the centre column spent before the conversation starts. The chips are one line total at any count.
- **They take the treatment of the suggested-prompt buttons** below them — `--surface` fill, 1px `--line` — one size down (`--micro` type, tighter padding). That is already what this page looks like when something is clickable, so the chips are not inventing a style.
- **No chevron is needed here, and that is not an exception to the rule below.** The chevron exists because `list-none` leaves a `<summary>` looking like a static label. A bordered button already reads as a control, so the affordance is inherent.
- The selected chip carries the pressed treatment (`--line-strong` border, `--surface-alt` fill) and `aria-expanded`. **Clicking the open chip closes it, and nothing is open by default** — a panel that is open on arrival spends the line height the chip row was built to save.
- **Every chip's `aria-controls` points at the same container**, which is rendered whether or not anything is open. Pointing each chip at its own panel would mean a chip whose panel has not been mounted yet referencing an id that is not in the document. Inside that container each tool's panel is a `role="region"` labelled with its own name, so the region a screen reader lands in is still named for the tool.
- **The description moves into the panel**, at the top, in `--small` `--ink-muted` per §269. This is a deliberate trade against the older rule that the tool row itself must be two lines (name + one line saying what it does): a one-line chip row cannot carry both, and the description is still the first thing inside, before any input. It works because tool names are self-describing nouns (会议成本, 口播时长), the right rail lists the same names as part of describing the agent, and a tool that is open is a tool the user already chose.
- **A tool that has been opened stays mounted.** Switching chips hides the previous panel with the `hidden` attribute rather than unmounting it, because a tool's inputs are component state, not stored state — unmounting would discard a half-filled 会议成本 the moment the user glanced at another tool. This is the same latch the previous per-tool `<details>` had.

### The profile — right rail

Not a strip, and not in the centre column:

```
│   ────                                         │
│   我的档案 · 已填 3 项                          │
│   身高（cm）                                    │
│   [ 175        ]                               │
│   主要目标                                      │
│   [ 减脂     ▾ ]                               │
│   补充说明                                      │
│   [ 膝盖有旧伤，每周只能练三次            ]     │
│   [ 清空档案 ]                                 │
```

- **It is not collapsed.** Every other rail section is permanently open — the three below it here, and the four describing sections in the left rail — and one accordion among them reads as a different kind of thing. The rail's idiom is a small heading with content under it, and the profile adopts it. The status (已填 3 项) goes on the heading line.
- **Why it is no longer in the centre column.** It is not an operation — it is standing facts about the user, which is what the rest of the rail already holds. The tools are operations and they hold drafts, so they must exist exactly once and the centre column is the only zone present at every breakpoint. The profile holds no draft: every input is controlled straight from the store's snapshot, so it is safe to exist twice. See the mounting rule below.
- **It is the first thing in the rail, and the rail holds nothing above it.** Everything that used to sit above it described the agent rather than the request, and moved to the left rail.
- **Below `lg` the rail is gone, so the profile falls back to a collapsed strip in the centre column.** Otherwise I9 (viewable, editable, deletable) would hold on a desktop and fail on a phone. This is the same duplication `RetrievalPanel` uses, and it costs one thing that must not be forgotten: **the two instances must not share element ids**, or the `<label for>` resolves to whichever is earlier in the DOM — the hidden one. `components/agent/ProfilePanel.tsx` therefore takes an `idPrefix` and both call sites pass a distinct one.
- **Loading is not empty.** While the profile is being read it says 读取中. Rendering the empty state first and filling it in a frame later tells the user their data is gone.
- The form reuses §8's field styling and carries a two-step 清空档案 confirmation. Its footer states that the profile is stored in this browser, does not sync across devices, and may be overwritten when several tabs are open.
- When the browser refuses storage, a **neutral**-coloured notice appears — not `--danger`. The user has done nothing wrong, and a permanently-red banner teaches people to ignore red.
- **补充说明 is a plain `<textarea>`, and it is the one profile control that is not a config field.** Every other field is declared by the agent and rendered as a form; this one is a free-text block every agent gets, under a label we author (`04_AGENT_SPEC.md` §6). It is multi-line by design, which is why its writes do not go through the same path as a declared field — see the note in `lib/store/memory.ts`.
- When the profile is empty and there is no conversation yet, the empty state gains one line above the suggested prompts inviting the user to fill it in. This is the product's onboarding moment, not chrome. That line stays in the **centre column**, because it is about the absence of a conversation rather than part of the form.

### The 资料夹 — right rail, directly under the profile

```
│   ────                                         │
│   资料夹 · 已存 2 / 5 篇                         │
│   会议纪要.pdf                            ✕     │
│   8,412 字符                                    │
│   ☑ 每次都带上                                  │
│   预算表.md                               ✕     │
│   31,208 字符（前 8,000 已读入，其余可检索）     │
│   ☑ 每次都带上                                  │
│   每次发消息会带上 2 篇，共 12,800 字            │
│   （按你自己的 Key 计费）。                      │
│   📎 添加文档                                   │
│   资料夹保存在这个浏览器里，不跨设备同步。…      │
```

- **It sits under the profile, not above it.** Both are standing context the user opted to carry; the profile is injected first in every request (`lib/rag/context.ts`), and the rail reads in the order the request does. 本次检索 stays last: it is the only per-turn section.
- **The shape is `AttachmentChips`, not a file manager.** Same name, same character sentence, same ✕, one row taller for the toggle. A saved document *is* an attachment with a longer life, and it should not look like a different kind of object. The count comes from the store's own selectors, never re-measured in the view.
- **The toggle is a native `<input type="checkbox">`.** It is a state the user owns, and the native control brings the checked-state announcement, Space to toggle, and the right role for free — the reason `Disclosure` is built on `<details>`. The document's name goes inside the `<label>` in an `sr-only` span, because five checkboxes labelled only 「每次都带上」 are five labels that identify nothing.
- **The cost line is exact and unhedged** — no 约, no "大概". The user is paying for it with their own key, and the number is a sum of what is actually injected, so an approximate one would be strictly worse than the real one. When nothing is included the line says what that means instead: they are still saved, and still retrieved on demand.
- **The cap is stated, not discovered.** At five, 添加文档 stays **visible and disabled** with the reason as a `title` *and* as one line of visible text — a hard product cap is not a transient busy state, so it earns the extra line, and a `title` is unreachable on a phone. The copy names the action (delete one first), not the limit alone.
- **删除 is two-step**, mirroring 清空档案 — 确认删除 in `--danger` plus 取消 — and it deletes one document. There is deliberately no 清空资料夹: five slots make per-document deletion enough, and "delete everything" is a product decision that should not arrive as a side effect.
- **Its footer is the honest durability statement**, and the strongest one this product can make: stored in this browser, not synced across devices, lost to 清除站点数据, private mode, or eviction. It never says 永久保存, 不会丢失 or 已备份.
- **Below `lg` it repeats as a collapsed strip in the centre column**, like the profile and for the same reason, with the same `idPrefix` obligation — both copies are in the DOM at once, and a shared id makes clicking a label flip the hidden checkbox instead of the visible one.

### 我的记录 — right rail, between the profile and the 资料夹

```
│   ────                                         │
│   我的记录 · 已记 1 条曲线                       │
│   [ 体重 ] [ 睡眠时长 ]                         │
│   ┌──────────────────────────┐                 │
│   │ 63 ┤        ╭─╮           │                 │
│   │ 62 ┤   ╭────╯ ╰──╮        │                 │
│   │ 61 ┤───╯          ╰──     │                 │
│   │    └┬─────┬─────┬─────┬── │                 │
│   │   01-01 03-01 05-01 07-01 │                 │
│   └──────────────────────────┘                 │
│   单位：kg · 2026-01-01 至 2026-09-27 · 共 12 条 │
│   纵轴自 60 起，不从 0 开始                      │
│   来源：你自己在这个浏览器里的记录                │
│   口径：早起空腹、同一台秤，每次记一个数           │
│   ☑ 每次都带上                                  │
│   日期 [ 2026-09-27 ]                           │
│   体重（kg） [ 62.5 ]                           │
│   备注（可不填） [              ]               │
│   [ 记一笔 ]                                    │
│   共 12 条记录                            ▸     │
│   每次发消息会带上 1 条，共 96 字（按你的 Key…   │
│   或者自己加一条                          ▸     │
│   记录保存在这个浏览器里，不跨设备同步。…         │
```

- **It sits between the profile and the 资料夹, and the order is the request's order rather than a preference.** All three are standing data the user authored, so all three are read at send time and all three sit above 本次检索. Among them the sequence is the prompt's: the profile block is composed first, the series summaries are inserted **inside** it, and the reference block the 资料夹 is numbered into comes after. The rail is now exactly that sequence and nothing else — these four sections are all it holds — so changing one means changing both (`components/agent/AgentRails.tsx`).
- **The chart is a mirror, not a coach, and that is a rule rather than a style.** It draws the points the user entered and the geometry needed to place them, and nothing the product computed about their meaning. No target or goal line; no healthy/normal band, shaded region or percentile curve; no average, median or trend line; no direction-dependent colour, delta chip or percentage change; no projection; no BMI, growth percentile or 达标 wording; no word of praise or alarm. `--success`, `--warning` and `--danger` do not appear here. Permitted: count, date range, min–max, latest value and date, and the axis-truncation statement. `04_AGENT_SPEC.md` §9 carries the four reasons, `mental`'s being the one with a safety consequence — the score is emotional intensity, so up is worse.
- **The caption is a requirement, not decoration.** `knowledge/office/data-analysis.md` states the rules the product already owns — 标题, 单位, 时间范围, 数据来源, and that a truncated y-axis 「需要明确标注」 — so every chart carries the series name as its heading, the 单位 · 范围 · 条数 line, 「纵轴自 60 起，不从 0 开始」 whenever the axis does not contain zero (「纵轴到 4000 止，不含 0」 the other way), 「来源：你自己在这个浏览器里的记录」, and the config's 口径 beneath it. The same sentence is the `<svg>`'s `aria-label`, so the chart is not silent to a screen reader.
- **One series at a time, selected by a chip row.** Two units cannot share an axis, and overlaying two series would need a second colour, which §2 does not allow. The chip carries `aria-pressed`, not `aria-expanded`: this selects, it does not disclose. The suggestion chips that start a new series are a separate row above, and a suggestion already taken is shown disabled as 「体重 · 已记」 rather than hidden.
- **Tick labels are plain ungrouped digits**, the rule this section already states for a tool's own numbers — `62.5`, not `62.50` and not `1,200`. The axis precision is derived from the tick step rather than from each value, so one axis cannot print `62` and `62.0`.
- **The degenerate cases are defined renderings, not divide-by-zero.** Zero points draws **no `<svg>` at all** — empty axes would lie about a chart existing. One point draws the point and its value as text with **no y-axis**, because an axis whose min equals its max misrepresents scale. All-equal values draw a flat line with one tick at that value and no invented ±. Above 40 points the dots are suppressed, because a dot smear is noise rather than information. The scale is **full linear, never log** — a log axis silently changes what the slope means. And the chart renders `w-full` with a `max-w`, because an uncapped width in the strip would scale the tick text up with it.
- **The overwrite rule is stated three ways**, because a silent overwrite is the one behaviour here a user cannot discover by trying it: a permanent hint under the date field; the button becoming 「覆盖 3 月 5 日」 with 「这一天已经记过 62.5 kg，保存会覆盖。」 above it when the date already carries a point; and a two-step per-point delete, without which a mis-*dated* point — which overwriting cannot fix — would distort the chart permanently. Inline, never a dialog: this spec has no dialog idiom and forbids one in three places.
- **The value box takes the unit in its label, not as a suffix** — the `NumberField` rule. 「62.5」 in a box marked 「体重（kg）」 is unambiguous, where a suffix invites 「62.5kg」.
- **The note field says who reads it.** 「备注只存在你这边，不会发给专家。」 It is the one field here a user would otherwise assume is injected, and it is not (`04_AGENT_SPEC.md` §9).
- **The cost line is exact and unhedged** — no 约, no "大概", the same rule and the same reason as the 资料夹's: the user pays with their own key, and the number is a sum of what is actually sent. When nothing is included it says what that means instead.
- **The cap is stated, not discovered.** At five series the suggestion chips and the 建立 button stay visible and disabled with the reason as visible text, and the copy names the action. A control that silently disappears reads as a bug.
- **Its footer is the same bounded durability statement the 资料夹 carries**, and it matters more here than there: a document can be attached again from the user's own file, and a measurement someone took off a scale cannot be retyped from anywhere. It never says 永久保存, 不会丢失 or 已备份.
- **Below `lg` it repeats as a collapsed strip in the centre column**, like the profile and the 资料夹, with the same `idPrefix` obligation. The strip's heading carries the count (「我的记录 · 已记 1 条曲线」), and the empty and unreadable states are distinguished rather than collapsed into one line — 「还没记」 and 「读取失败」 are different facts. The chart itself is not the only thing that must survive the narrow viewport, so the strip is a `<details>` rather than a truncation.

### Collapsed rows

The rule below governs every `<details>` in the workspace — the retrieved-context section, each chunk inside it, and the profile strip below `lg`. It is not decoration, and it is what `components/ui/Disclosure.tsx` exists to enforce:

- **A collapsed row must look like a control.** The native `<summary>` marker is browser-inconsistent, so it is hidden — but hiding it *without* drawing a replacement leaves a line of grey text with no affordance at all. That failure is invisible on a desktop pointer (`cursor: pointer` is the only remaining hint) and total on a touch screen, which has no cursor. Every collapsed row therefore carries a drawn chevron that rotates 180° on open, a `--surface` fill inside a 1px `--line` border, and a hover state that darkens the border to `--line-strong`. The chevron sits **left of the text**, aligned to the first line.
- A row inside another row (a chunk inside the hits section) takes the same chevron without the border. A second bordered box within a bordered box reads as a mistake.
- Each is collapsed by default — the same interaction as the retrieved-context panel, which makes keyboard operation free.

### Mounting, and where a component may be duplicated

The narrow-screen adaptation in this layout *duplicates* below `lg` rather than moving: both copies are in the DOM, one hidden by `display: none`. Whether that is safe is a property of the component, not of the layout:

- **A draft held in component state must exist exactly once.** Two copies are two independent drafts, and typing into the visible one and then widening the window past `lg` silently discards what was typed. The tools are in this class (their inputs are `useState`) and so is `ChatInput`.
- **A component whose inputs are controlled from a store snapshot may be duplicated**, provided its element ids carry an instance prefix. The profile is in this class: it renders `value` straight from `lib/store/memory.ts` and keeps no draft of its own, so both copies read the same source. It still has to set `idPrefix`, because duplicate ids would break `<label for>`. `RetrievalPanel` is duplicated for the same reason and needs no prefix, holding no controls at all.
- **A draft shared from a single module-state source may be duplicated**, with the same `idPrefix` obligation. This was added for 我的记录, and the first two classes did not cover it: the record entry form *is* a transaction with a draft, so the first rule would have put it in the tools' class and mounted it once — which would have put the entry affordance in a different column from the chart above `lg`, since the tools live in the centre column and the rail is gone below it. That is a worse product than the one the rail gives, and the rail is what the owner chose.

  The rule's real subject is not "does it hold a draft" but **"does every copy read the same draft"**, and `lib/store/series.ts` is what makes the answer yes: the draft lives in module state per agent, outside the record and outside the snapshot. So a half-typed value survives the window crossing `lg`, a reload discards it (right for a transaction), and nothing is written to `IndexedDB` per keystroke. The snapshot deliberately does not include it, so its identity is unchanged while the user types and `useSyncExternalStore` bails out — the chart, the series list, the cost line and the whole `Workspace` do not re-render on a keystroke; only the two form instances do.

  What it costs: the panel is the one component in this product that is **both** duplicated **and** holds a draft, so a future reader who applies the first bullet by pattern will mount it once and break the narrow-screen form. That is why the class is written here rather than left to `components/agent/SeriesPanel.tsx` to explain.

### The expanded tool

An instant tool needs no API key, so it is the first thing on the page that does something. Its expanded body is a small panel, not a form dropped into the conversation:

```
⌄ 会议成本                                        ┐
  按人数、时长和平均时薪，算出这场会花多少钱。      ┘ ← Small, --ink-muted
  ────────────────────────────────────────────────
  参会人数（人）  会议时长（分钟）  平均时薪（元）   ┐
  [ 8         ]  [ 60          ]  [ 150       ]   ┘ ← §8 field styling

  这场会成本约                                      ┐
  1200 元                                          │ ← H2 / 600 / tabular-nums.
  每人约 150 元                                     │    The answer is the anchor,
                                                   ┘    not a clause in a sentence.
  只算参会人的时间成本，不含场地、差旅和会前准备。     ← Micro, --ink-subtle
  ────────────────────────────────────────────────
  [ 把结果发给专家 ]   先在设置里填好 API Key       ← secondary, md
```

The whole box is one `<details>`: the `--surface` fill and the drawn chevron are the header's, the hairline is the body's, and the action row closes it.

- **The answer is typographically the largest thing in the panel.** It was previously a clause inside a sentence at `--small`, with the estimation basis at `--micro` directly beneath — four steps of an already-narrow type scale apart, so the number read as one more word in the sentence and the caveat as its continuation. The answer now takes `--h2` with `tabular-nums`, on its own line under a `--micro` label; the number is the anchor and everything else qualifies it. The basis stays `--micro`, grouped with the answer rather than left as the next item of the panel's spacing.
- **The panel's numbers are not grouped or symbolised** — `1200 元`, not `¥ 1,200`. Thousands separators would mean `toLocaleString`, whose output depends on the runtime's ICU data, and a tool that renders differently on two machines is the kind of drift `04_AGENT_SPEC.md` §7 rules out for constants. The unit suffix matches the input labels.
- **The tool's own description is `--small` `--ink-muted`, not `--micro` `--ink-subtle`.** It is the only thing telling the user what the panel is for, and `--micro --ink-subtle` is the least legible combination on the page.
- **The action sits in a footer row behind a hairline** — the same construction as the profile form's 清空档案 row. It stays `secondary`: §2 allows one `--accent` action per screen and the chat input's 发送 already holds it. Prominence comes from the contained panel and the footer, not from colour.
- **Disabled with a reason, never hidden** (`04_AGENT_SPEC.md` §7). 「先在设置里填好 API Key」 is the difference between a dead end and an instruction.
- **Estimates stay labelled as estimates**, with the range and its basis visible. `04_AGENT_SPEC.md` §7 forbids drifting constants and requires a range to be shown as one.

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
- **Send is enabled by a ready attachment alone.** 「把这个文件看一下」 is an ordinary thing to want, and a user who has handed over a document and watches Send stay grey reads it as the product refusing the file. So an empty box with at least one `ready` chip sends. Two things follow, and both are decisions rather than details:
  - **The turn says `（见附件）`.** A user turn cannot be empty — the bubble would render as a blank box, and the model would be asked to answer with no question in front of it. So the message carries a placeholder, and this is the one place in the product where a user turn contains words the user did not type. It is honest about what happened, and the file's own head is in the prompt regardless: injection is not retrieval, so the model reads the document whether or not the placeholder matches it (`02_TECH_SPEC.md` §8.7).
  - **A chip that is still parsing, or that failed, does not enable it.** There is nothing sendable yet in the first case and nothing to send in the second, so the button enabling itself would be a lie in both.
- The gate is **one predicate**, shared by the button's `disabled` and by Enter, so the two cannot disagree about whether there is something to send.
- Disabled state (no key configured) keeps the input visible and replaces the placeholder with a prompt to configure a provider, plus a link. **Do not hide the input** — hiding it makes the product look broken.
- Attachment chips render above the textarea with a remove control and the parsed-character count. Character count, not file size — what matters is whether it fit.

### Attachments

```
┌──────────────────────────────────────────────────────────────┐
│  📄 会议纪要.pdf · 8,412 字符                            ✕   │
│  📄 预算表.md · 31,208 字符（前 24,000 已读入，其余可检索） ✕ │
│  📄 扫描件.pdf · 没有可提取的文字，可能是扫描件           ✕   │
│                                                              │
│  想让这位专家做什么？                                          │
│                                                              │
│  [📎 附件]  文件只在你的浏览器里解析，不会上传。    [ 发送 → ] │
└──────────────────────────────────────────────────────────────┘
```

- The attach control sits in the control row, to the left of the Send button. It is a button plus a visually hidden `<input type="file" multiple>`; the button is the focus target, so the hidden input never needs to be.
- **Attaching is not gated on having a key.** Files can be prepared before a provider is configured, and become sendable the moment one is.
- Chips are a list of things, so they are a `<ul>` of `<li>`. Each remove control is a real `<button>` with a Chinese `aria-label` naming the file (§11, J4).
- Chip states, and the only place `--danger` is allowed here — a genuine per-file status, never decoration:

  | State | Copy |
  |---|---|
  | parsing | `文件名 · 读取中…` |
  | ready, fits | `文件名 · 8,412 字符` |
  | ready, truncated | `文件名 · 31,208 字符（前 24,000 已读入，其余可检索）` |
  | failed | `文件名 · <the reason>` in `--danger` |
  | ready (extra control) | `… 存到资料夹` |

- **A refusal is shown on the chip, not in a dialog and not in the conversation's error card.** The failure belongs to one file, and two files can fail for two different reasons in the same turn. A failed chip keeps its remove control so the reason stays readable until the user clears it.
- **存到资料夹 appears on a `ready` chip only** — a file still being read has no text to save and a failed one has none at all — and only while the 资料夹 can be written to. It is a `<button type="button">`, and that is load-bearing rather than tidy: the chips render inside `ChatInput`'s `<form>`, where a button with no `type` defaults to `submit` and would send the message.
- **Saving removes the chip.** The document has moved from this turn's material to standing material, and its head is injected on every message including this one — leaving the attachment in place would put the same text in the reference block twice, at the user's expense, in a block whose entries are numbered. The chip vanishing *is* the feedback; the panel it moved into is beside it. On a refusal the chip **stays**, carrying its parsed text, so the same click works once a slot is free. There is deliberately no 「已存入」 badge: it would be a second source of truth about the folder, and it would be wrong the moment the document was deleted from the panel.
- The refusal for an oversized file happens against the declared size, before anything is read, so it is immediate even for a very large file.
- **The privacy line is required, not optional** (`01_PRD.md` §6). It occupies the same row as the no-key hint and replaces it once a key exists: `文件只在你的浏览器里解析，不会上传。`
- Uploads persist across turns for the whole session — that is what makes a follow-up question about the same document work — and are dropped when a new conversation is started or the page is reloaded. **The 资料夹 is the exception and the only one**: a document saved there survives both, deliberately (`04_AGENT_SPEC.md` §8). 清空对话 clears the transcript and the chips; it does not touch the folder.
- A 资料夹 refusal — a full folder, or a store that cannot be written — appears as a neutral `Notice` directly **above the message box**, because that is where the click was made (the chip row and the panel's add control are both there) and because below `lg` the rail that holds the folder is collapsed.
- Drag-and-drop is deliberately **not** specified. It is not in `01_PRD.md` §6's scope, and anything outside the in-scope list is a defect (`01_PRD.md` §2).

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
