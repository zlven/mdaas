# AI 超级专家（MDAAS）

一个垂直领域的 AI 专家矩阵：10 位专家，每位有自己的知识库、工作流和安全边界。

**当前可用 3 位**：全能办公、自媒体爆款运营、形体运动健身。另外 7 位标注「即将推出」。

---

## 这个项目和别的有什么不一样

三件事：

1. **每位专家有自己的知识库。** 不是一段共用的提示词。办公专家查不到自媒体的知识，因为它的浏览器里根本没下载过那份文件——**隔离是结构性的，不是过滤。**
2. **没有服务端。** 整个产品是纯静态的，部署在免费托管上就完事，跑起来是 ¥0。
3. **API Key 是你自己的。** 存在你自己的浏览器里，直接发给模型服务商。我们这边没有服务器，也收不到。

代价也是真实的：Key 是明文存储、不会跨设备同步、换台电脑要重新填。这些我们写在设置页里，不藏着。

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
  rag/                      分块、BM25 检索、中文分词
  workflow/definitions/     工作流定义
  store/                    localStorage / IndexedDB 封装
  safety/                   安全策略
  generated/                构建产物，不要手改

prompts/                    系统提示词（中文）      ← 改专家行为改这里
knowledge/<agent>/          知识库 markdown（中文） ← 加知识改这里
public/knowledge/           构建产物，不要手改

docs/                       项目文档（英文）
scripts/build-assets.mts    构建脚本
```

**`prompts/` 和 `knowledge/` 是源文件。** `lib/generated/` 和 `public/knowledge/` 是构建出来的，不要直接编辑。

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

2. **写提示词** — `prompts/my-agent.md`，必须包含七个部分（身份、范围、专长、工作流、输出格式、安全规则、禁止事项）和三条强制条款。

3. **（可选）加知识库** — `knowledge/my-agent/` 下放 markdown 文件。

4. **（可选）加工作流** — `lib/workflow/definitions/`。

做完跑一次 `npm run build:assets`。**如果还需要改其他地方，说明架构出问题了**，参见 `docs/06_ACCEPTANCE.md` C4。

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

知识库内容和用户上传的文件都按**不可信数据**处理，以「参考资料」的形式注入，不作为指令执行。

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
| `docs/06_ACCEPTANCE.md` | 验收标准 A–K |
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
