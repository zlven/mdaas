import { PROMPTS } from "@/lib/generated/prompts";
import type { AgentConfig } from "@/lib/agents/types";

/**
 * docs/04_AGENT_SPEC.md §4.5 — the safety-critical group.
 *
 * `minor-safety`. The prompt's §6.8 is a referral boundary like `mental`'s: a
 * single signal of harm, self-harm, or a developmental concern stops the
 * parenting advice and hands off. It names only generic routes to help, and
 * names no specific helpline, institution, or hospital.
 *
 * Two rules sit alongside it that are specific to this agent: no diagnosis of a
 * child (no 多动 / 自闭 / 感统失调 labels, even when the parent supplies one),
 * and no punitive technique — no corporal punishment, shaming, or leaving a
 * young child alone to "cry it out".
 *
 * Nothing in the runtime verifies this. `06_ACCEPTANCE.md` I13–I18 are the
 * manual checks, and they are the reason this agent ships at all.
 */
export const parenting: AgentConfig = {
  id: "parenting",
  name: "Parenting Companion",
  nameZh: "AI 亲子教育陪伴专家",
  icon: "🧒",
  category: "life",
  description: "按孩子的年龄段给出沟通和陪伴的方法。不做儿童诊断。",
  capabilities: ["亲子沟通", "习惯培养", "情绪引导", "年龄特点"],
  // Age is the single field that changes every answer, so it is the one the
  // profile must hold. The other three are the questions a parent most often
  // has to repeat across days (04_AGENT_SPEC.md §6).
  profile: [
    {
      key: "age",
      label: "孩子的年龄段",
      type: "select",
      options: ["0–3 岁", "3–6 岁", "6–9 岁", "9–12 岁", "12–15 岁", "15 岁以上"],
    },
    {
      key: "temperament",
      label: "孩子的性格特点",
      type: "text",
      hint: "一句话就行，比如：慢热、认死理、很在意别人怎么看",
    },
    {
      key: "concern",
      label: "目前最想解决的一件事",
      type: "text",
      hint: "比如：早上出门磨蹭、写作业拖、一不顺心就摔门",
    },
    {
      key: "caregivers",
      label: "主要带孩子的人",
      type: "select",
      options: ["父母自己带", "老人帮忙带", "两边轮流", "其他情况"],
    },
  ],
  enabled: true,
  systemPrompt: PROMPTS.parenting,
  knowledgeBase: "parenting",
  tools: ["month-age"],
  workflows: [],
  modelProfile: "balanced",
  safetyPolicy: "minor-safety",
  suggestedPrompts: [
    "五岁的孩子一不顺心就打人，说了很多次都没用，该怎么办",
    "写作业每天都要催七八遍，催到最后都是我发火，怎么改成他自己做",
    "孩子上小学后明显不爱说话了，问什么都说不知道，怎么才能聊起来",
  ],
};
