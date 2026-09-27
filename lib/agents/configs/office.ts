import { PROMPTS } from "@/lib/generated/prompts";
import type { AgentConfig } from "@/lib/agents/types";

/** docs/04_AGENT_SPEC.md §4.1 — the B2B flagship. */
export const office: AgentConfig = {
  id: "office",
  name: "Office Productivity Expert",
  nameZh: "AI 全能办公专家",
  icon: "💼",
  category: "work",
  description: "把会议、报告、邮件和文档，变成可以照着做的结论与下一步。",
  capabilities: ["会议纪要", "工作报告", "商务邮件", "PPT 大纲", "文档分析"],
  profile: [
    { key: "role", label: "职位", type: "text" },
    { key: "industry", label: "行业", type: "text" },
    { key: "reportsTo", label: "主要汇报对象", type: "text", hint: "比如：部门总监、CEO、客户方负责人" },
    {
      key: "docType",
      label: "最常写的文档",
      type: "select",
      options: ["会议纪要", "工作报告", "商务邮件", "PPT 大纲", "数据分析"],
    },
  ],
  enabled: true,
  systemPrompt: PROMPTS.office,
  knowledgeBase: "office",
  // From `knowledge/office/retrospective.md`: a 复盘 has to check the previous
  // round's improvement items before it sets new ones. Counting them is how that
  // gets a history rather than a memory.
  metrics: [
    { key: "actions", label: "复盘改进项", unit: "项", basis: "本轮复盘定下的改进项有几项，下一轮要回头检查的就是这些" },
  ],
  tools: ["meeting-cost"],
  workflows: ["office-meeting-summary"],
  modelProfile: "reasoning",
  safetyPolicy: "content-default",
  suggestedPrompts: [
    "把这段会议记录整理成纪要，标出决议、负责人和截止时间",
    "帮我写一封催进度的商务邮件，要专业但不失礼",
    "根据这份周报草稿，提炼出三个给上级看的要点",
  ],
};
