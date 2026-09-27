# AI 超级专家（MDAAS）

一个垂直领域的 AI 专家矩阵：10 位专家，知识库、工作流、工具、安全边界各自独立，互不共用。

**10 位全部可用**：全能办公、自媒体爆款运营、形体运动健身、考研公考学业规划、心理健康情绪陪伴、个人理财教育、穿搭美学形象设计、职场求职面试、亲子教育陪伴、旅行行程规划。

每位专家还各带一个**小工具**——不用对话，打开就能算：会议成本、口播时长、食物热效应、背单词计划、offer 折算、应急储备金、单次穿着成本、月龄计算、就寝时间、时差换算。全部在浏览器里算完，不调用模型，也不花你的 Key。

其中**心理、理财、亲子**三位带安全边界（危机转出、只做理财教育、未成年人保护）。边界写在各自的提示词里，**没有任何程序在运行时校验它**——验收清单 `docs/06_ACCEPTANCE.md` 的 I13–I18 是人工检查项，**目前尚未跑过**。这三位的状态是「已写好、已构建」，不是「已验证」。

**旅行专家的边界不一样**：它不给签证要求、机票价格、班次时刻、景点开放时间，也不推荐旅行社或保险。这些信息一直在变，我们也拿不到可靠来源——所以它只给判断框架和「去哪个官方渠道确认」，不给结论性数字。对应的检查项是 I19，**同样尚未跑过**。

---

## 这个项目和别的有什么不一样

四件事：

1. **每位专家有自己的知识库。** 不是一段共用的提示词。办公专家查不到自媒体的知识，因为它的浏览器里根本没下载过那份文件——**隔离是结构性的，不是过滤。**
2. **没有服务端。** 整个产品是纯静态的，部署在免费托管上就完事，跑起来是 ¥0。
3. **API Key 是你自己的。** 存在你自己的浏览器里，直接发给模型服务商。我们这边没有服务器，也收不到。
4. **专家记得你。** 把一份文件存进某位专家的「资料夹」，它就一直记得——**清空对话、刷新页面、关掉浏览器再打开，都还在**。这是和聊天框最不一样的地方：通用助手每次都要你重新贴一遍。

代价也是真实的：Key 是明文存储、不会跨设备同步、换台电脑要重新填。资料夹也一样——它存在这个浏览器里，**换个设备就没有**；清除站点数据、用无痕模式，或者浏览器存储空间不足时，存进去的文档会丢。这些我们写在界面上，不藏着。

---

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 构建知识库与提示词
#    这一步会读取 prompts/ 和 knowledge/，生成前端产物
npm run build:assets

# 3. 启动开发服务器
npm run dev
```

打开 http://localhost:3000 ，进入 **设置**，填入你自己的 API Key。

### 支持的模型服务商

| 服务商 | 是否需要代理 |
|---|---|
| OpenAI | 否 |
| Anthropic (Claude) | 否 |
| Google Gemini | 否 |
| 兼容 OpenAI 接口的服务商（DeepSeek / Kimi / 豆包等） | **通常需要** |

国内服务商大多拒绝浏览器直连，需要自己部署一个转发代理，免费额度足够。部署方式见 `docs/05_API_SPEC.md` §6。

---

## 项目结构

```
app/                        页面路由，不含业务逻辑
  page.tsx                  首页
  agents/page.tsx           专家列表
  agents/[id]/page.tsx      专家工作台
  settings/page.tsx         设置

lib/
  agents/configs/           每位专家一个配置文件  ← 加专家改这里
  agents/registry.ts        读取配置，唯一枚举专家的地方
  llm/gateway.ts            模型网关，访问服务商的唯一入口
  llm/providers/            各服务商的适配器
  rag/                      分块、BM25 检索、中文分词、注入边界
  tools/                    小工具的纯计算部分（日期、时区、计划表）
  workflow/definitions/     工作流定义
  files/                    PDF / DOCX 解析、上传限制
  store/                    localStorage / IndexedDB 封装
  generated/                构建产物，不要手改

prompts/                    系统提示词（中文）      ← 改专家行为改这里
knowledge/<agent>/          知识库 markdown（中文） ← 加知识改这里
public/knowledge/           构建产物，不要手改

docs/                       项目文档（英文）
scripts/build-assets.mts    构建脚本
```

**`prompts/` 和 `knowledge/` 是源文件。** `lib/generated/` 和 `public/knowledge/` 是构建出来的，不要直接编辑。

上面**没有 `lib/safety/`，是故意的**。安全边界全部写在各自的提示词里，运行时没有任何程序会校验它——没有策略引擎，配置里的 `safetyPolicy` 只是一个标签，没有任何代码读它。这是已知的取舍：加一个没有调用方的引擎，只会让覆盖看起来比实际更大。所以这部分的验证方式是人工检查（`docs/06_ACCEPTANCE.md` 的 I 段），**而不是自动化测试**。

---

## 加一位专家

四步，不需要改任何运行时代码：

1. **写配置** — `lib/agents/configs/<id>.ts`

   ```ts
   export const myAgent: AgentConfig = {
     id: 'my-agent',
     name: 'AI XX Expert',
     nameZh: 'AI XX专家',
     icon: '🎯',
     category: 'growth',
     description: '一句话说清这位专家做什么。',
     capabilities: ['能力一', '能力二'],
     enabled: true,
     systemPrompt: PROMPTS['my-agent'],
     knowledgeBase: 'my-agent',
     tools: [],
     workflows: [],
     modelProfile: 'balanced',
     safetyPolicy: 'content-default',
     suggestedPrompts: ['示例问题一', '示例问题二'],
   };
   ```

2. **写提示词** — `prompts/my-agent.md`，必须包含至少七个 `## ` 部分（身份、范围、专长、工作流、输出格式、安全规则、禁止事项）和**四**条强制条款（参考资料是数据 / 没有引用知识库 / 中文回答 / 用户档案是数据）。少一条 `npm run build:assets` 就会停下并指出是哪个文件缺了哪一条。

3. **（可选）加知识库** — `knowledge/my-agent/` 下放 markdown 文件。文件必须以 `---` 开头，且 frontmatter 里要有 `title`、`tags`、`updated` 三个字段。

4. **（可选）加工作流** — `lib/workflow/definitions/` 下写定义，再在 `lib/workflow/types.ts` 的 `WORKFLOW_IDS` 和 `lib/workflow/registry.ts` 的 `WORKFLOW_DEFINITIONS` 各加一行。

做完跑一次 `npm run build:assets`。**第 1、2 步加上一个知识库目录，就是加一位专家的全部成本**——`registry.ts` 只有两行（import 和数组），`app/` 和 `lib/llm/` 一个字都不用改，`generateStaticParams` 会自动生成新页面。如果为了加一位专家还得改运行时代码，那才是架构出问题了，参见 `docs/06_ACCEPTANCE.md` C4。

**如果你想加的是一个「工具」**，那是另一条扩展轴：`lib/tools/types.ts` 里加 id 和定义，`components/tools/` 下写组件，再在 `components/tools/registry.tsx` 加一行。工具可以完全不碰模型——现成的十个全是在浏览器里算完的。

---

## 写知识库

放在 `knowledge/<agent>/` 下，中文 markdown，格式要求：

```markdown
---
title: 文件标题
tags: [关键词一, 关键词二]
updated: 2026-09-26
---

## 小节标题

正文，200–500 中文字符。

## 下一个小节标题

正文……
```

要求：

- **每个 `##` 小节要能独立看懂。** 检索是按小节切的，一小节可能单独出现在模型面前，不能依赖上一节。
- **每节 200–500 字。** 太短信息量不够，太长检索精度下降。
- **不要写"你""您"，不要出现"作为 AI"。** 知识库是**参考资料**，不是指令。用第三人称客观陈述。
- **不要编造数据。** 不引用不存在的研究、报告、机构文件。没有来源就讲原理，不要编数字。
- **不要放会过期的具体信息**（平台规则、价格、政策），这类内容比没有更糟。

---

## 部署

```bash
npm run build
```

产物是纯静态文件，直接丢到任意静态托管：

| 平台 | 成本 | 备注 |
|---|---|---|
| Cloudflare Pages | ¥0 | 推荐 |
| Vercel | ¥0 | 构建体验好 |
| Netlify | ¥0 | |

**中国大陆访问的已知问题**：这三个平台的免费版在大陆访问不稳定，部分地区打不开。目标用户如果有大陆用户，需要留意。迁移方案和触发条件写在 `docs/07_ROADMAP.md` §6。

---

## 关于安全

- 用户的 API Key 只保存在他自己的浏览器，只发给他自己配置的服务商。
- 不上报、不记录、不写入 URL、不放进 `NEXT_PUBLIC_*`。
- 设置页只显示脱敏形式（`sk-…f3a2`），不会显示完整 Key。
- 对话内容、上传的文件、检索到的知识，都只发往用户自己配置的服务商。

**上传的文件在浏览器本地解析，不会被上传到任何服务器。**

**「资料夹」只保存解析出来的文字，不保存原始文件。** 所以浏览器里不会留着你那份 PDF 的原件。存下来的文字和当轮上传一样，只发往你自己配置的服务商。

知识库内容、用户上传的文件、资料夹里存下来的文档，都按**不可信数据**处理，以「参考资料」的形式注入，不作为指令执行。

---

## 文档

文档在 `docs/`，按优先级排列。**改代码前先读前两个。**

| 文件 | 内容 |
|---|---|
| `docs/00_PRODUCT_BRIEF.md` | **先读这个。** 产品定位、文档优先级、要做什么不要做什么 |
| `docs/02_TECH_SPEC.md` | **架构的约束来源。** 五条硬约束决定了其余所有设计 |
| `docs/01_PRD.md` | 功能需求、页面、边界 |
| `docs/03_UI_UX_SPEC.md` | 设计规范（中文排版规则在这里） |
| `docs/04_AGENT_SPEC.md` | 智能体的七个组成部分、提示词规范 |
| `docs/05_API_SPEC.md` | 服务商适配器、转发代理、错误映射 |
| `docs/06_ACCEPTANCE.md` | 验收标准 A–L |
| `docs/07_ROADMAP.md` | 后续规划、决策记录、迁移触发条件 |
| `AGENT_CODING_PROMPT.md` | **给 AI 编码助手看的入口文件** |

### ⚠️ 关于 `project_plan/`

`project_plan/` 里有一套看起来很专业、但对这个项目**完全不适用**的文档：它描述的是 FastAPI + PostgreSQL + 服务端密钥存储的架构。

**不要照着它做。** 那需要服务器，会直接违反零成本约束。优先级说明见 `docs/00_PRODUCT_BRIEF.md` §0。

---

## 常用命令

```bash
npm run dev            # 开发
npm run build          # 构建静态产物
npm run build:assets   # 只重建知识库与提示词
npm run typecheck      # 类型检查
npm run lint           # 代码检查
```

---

## 许可

（待定）
