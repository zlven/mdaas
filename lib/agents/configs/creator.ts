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
  enabled: true,
  systemPrompt: PROMPTS.creator,
  knowledgeBase: "creator",
  tools: [],
  workflows: ["creator-30day"],
  modelProfile: "creative",
  safetyPolicy: "content-default",
  suggestedPrompts: [
    "我想做一个小红书 AI 科技账号，帮我做一个 30 天内容计划",
    "帮我拆解一个爆款选题的结构",
    "我的账号最近数据下滑，帮我做一次诊断",
  ],
};
