import { PROMPTS } from "@/lib/generated/prompts";
import type { AgentConfig } from "@/lib/agents/types";

/**
 * docs/04_AGENT_SPEC.md §4.5 — the safety-critical group.
 *
 * `crisis-escalation`. The prompt's §6.10 is the highest-risk content in the
 * product: it names only generic routes to help (a trusted person, a hospital
 * psychiatric or psychology department, a school or workplace counselling
 * centre, the local emergency number) and deliberately names **no** specific
 * helpline, institution, or number — inventing one is worse than naming none.
 *
 * It is the counterpart to `fitness`'s referral boundary and is stricter: it
 * fires on a single signal and stops the wellness content entirely.
 *
 * Nothing in the runtime verifies this. `06_ACCEPTANCE.md` I13–I18 are the
 * manual checks, and they are the reason this agent ships at all.
 */
export const mental: AgentConfig = {
  id: "mental",
  name: "Mental Wellness Companion",
  nameZh: "AI 心理健康情绪陪伴专家",
  icon: "🧠",
  category: "health",
  description: "记录情绪、梳理压力、练习正念。不做诊断，高风险情况会引导你寻求专业帮助。",
  capabilities: ["情绪记录", "压力梳理", "正念练习", "睡眠调节"],
  // Every one of these deliberately asks for a *state*, not a diagnosis. The
  // profile exists so the agent does not have to ask a second time what someone
  // already had to work up the nerve to write once (04_AGENT_SPEC.md §6).
  profile: [
    {
      key: "mood",
      label: "最近的情绪状态",
      type: "select",
      options: ["还算平稳", "时好时坏", "持续低落", "容易紧张", "说不上来"],
    },
    {
      key: "sleep",
      label: "睡眠情况",
      type: "select",
      options: ["正常", "入睡困难", "夜里常醒", "醒得太早", "睡够但不解乏"],
    },
    {
      key: "stressor",
      label: "目前主要的压力来源",
      type: "text",
      hint: "一句话就行，比如：工作强度、和家人相处、对未来没有把握",
    },
    {
      key: "support",
      label: "现在能说话的人",
      type: "select",
      options: ["有，而且能说心里话", "有，但不太想说", "基本没有"],
    },
    {
      key: "care",
      label: "是否正在接受专业帮助",
      type: "select",
      options: ["没有", "在咨询", "在就医", "暂时不想说"],
    },
  ],
  enabled: true,
  systemPrompt: PROMPTS.mental,
  knowledgeBase: "mental",
  tools: [],
  workflows: [],
  modelProfile: "balanced",
  safetyPolicy: "crisis-escalation",
  suggestedPrompts: [
    "最近总是很累，睡多久都不解乏，帮我看看到底是哪里出了问题",
    "心里一直有件事过不去，我不太想跟熟人说，想找个人说说",
    "晚上一躺下脑子就停不下来，有没有今晚就能试的办法",
  ],
};
