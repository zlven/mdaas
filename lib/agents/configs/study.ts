import { PROMPTS } from "@/lib/generated/prompts";
import type { AgentConfig } from "@/lib/agents/types";

/**
 * docs/04_AGENT_SPEC.md §4.1–4.4 — the functional group.
 *
 * `content-default` policy, but the prompt carries a mental-health escalation
 * boundary of its own (§6.8): sustained low mood, sleep or appetite change, or
 * any self-harm signal stops the planning answer and hands off to a
 * professional. Like `fitness`, the boundary is behaviour, not a disclaimer.
 */
export const study: AgentConfig = {
  id: "study",
  name: "Exam Prep Planner",
  nameZh: "AI 考研公考学业规划专家",
  icon: "📚",
  category: "work",
  description: "把备考拆成阶段目标和每日任务，管进度，也管心态。",
  capabilities: ["备考规划", "院校选择", "复习方法", "进度管理"],
  // The suggested prompts already ask about stage, subjects and available
  // hours. A profile is what turns those one-off questions into standing
  // facts the agent stops having to ask for (docs/04_AGENT_SPEC.md §6).
  profile: [
    {
      key: "stage",
      label: "备考阶段",
      type: "select",
      options: ["还没开始", "基础期", "强化期", "冲刺期", "临考期"],
    },
    {
      key: "target",
      label: "目标院校或岗位",
      type: "text",
      hint: "比如：某某大学 计算机专硕、省考 A 类综合管理岗",
    },
    {
      key: "subjects",
      label: "考试科目",
      type: "text",
      hint: "比如：政治、英语一、数学一、专业课；或行测、申论",
    },
    { key: "dailyHours", label: "每日可用时长", type: "number", unit: "小时" },
  ],
  enabled: true,
  systemPrompt: PROMPTS.study,
  knowledgeBase: "study",
  tools: ["word-plan"],
  workflows: [],
  modelProfile: "reasoning",
  safetyPolicy: "content-default",
  suggestedPrompts: [
    "我准备考研，数学基础一般，帮我排一份从现在到初试的阶段计划",
    "英语真题阅读总是错三个以上，帮我判断问题出在词汇、方法还是速度",
    "在职备考，每天只有两小时，帮我看看这份周计划排得合不合理",
  ],
};
