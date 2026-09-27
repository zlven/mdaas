/**
 * The system prompt carried by agents that are not implemented.
 *
 * docs/04_AGENT_SPEC.md §4.4 is explicit that the five Coming Soon agents must
 * not have real prompts written in the MVP: shipping an unverified prompt for
 * `mental` or `parenting` would carry safety obligations that nothing checks.
 *
 * But `AgentConfig.systemPrompt` is a required string, so the field is filled
 * with something that announces itself. The important property is not that this
 * text is good — it is that `enabled: false` makes it unreachable, so if it ever
 * reaches a model, the UI guard has failed and the reply will say so.
 */
export const NOT_IMPLEMENTED_PROMPT = [
  "【未实现】本专家尚未开放。",
  "",
  "如果你正在阅读这段文字，说明工作台的 enabled 校验被绕过了 —— 这是一个缺陷，",
  "不是一个可以回答的问题。请回复用户：该专家仍在开发中，请在专家列表中另选一位。",
].join("\n");
