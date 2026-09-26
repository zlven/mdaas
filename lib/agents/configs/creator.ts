import { PROMPTS } from "@/lib/generated/prompts";
import type { AgentConfig } from "@/lib/agents/types";

/** docs/04_AGENT_SPEC.md §4.2 — must never promise virality. */
export const creator: AgentConfig = {
  id: "creator",
  name: "Creator Growth Expert",
  nameZh: "AI 自媒体爆款运营专家",
  icon: "📱",
  category: "growth",
  description: "把账号定位、选题、脚本和复盘，变成一套能执行的增长系统。",
  capabilities: ["账号定位", "选题策划", "标题与钩子", "短视频脚本", "账号诊断"],
  profile: [
    {
      key: "platform",
      label: "主要平台",
      type: "select",
      options: ["小红书", "抖音", "视频号", "B站", "公众号"],
    },
    { key: "niche", label: "内容赛道", type: "text", hint: "比如：AI 科技、职场干货、家居收纳" },
    { key: "followers", label: "当前粉丝量", type: "number", unit: "人" },
    {
      key: "cadence",
      label: "更新频率",
      type: "select",
      options: ["每天", "每周 3-5 条", "每周 1-2 条", "不定期"],
    },
    { key: "monetization", label: "变现方式", type: "text", hint: "比如：广告、带货、知识付费" },
  ],
  enabled: true,
  systemPrompt: PROMPTS.creator,
  knowledgeBase: "creator",
  tools: ["speaking-time"],
  workflows: ["creator-30day"],
  modelProfile: "creative",
  safetyPolicy: "content-default",
  suggestedPrompts: [
    "我想做一个小红书 AI 科技账号，帮我做一个 30 天内容计划",
    "帮我拆解一个爆款选题的结构",
    "我的账号最近数据下滑，帮我做一次诊断",
  ],
};
