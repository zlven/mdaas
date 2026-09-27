/**
 * The system prompt carried by an agent that has been registered but not built.
 *
 * **Nothing imports this today.** All nine agents are `enabled: true` and all
 * nine have a real prompt. It stays because `AgentConfig.systemPrompt` is a
 * required string, so the staging path — register the config first, write the
 * content later — needs *something* to put in the field, and `enabled: false`
 * is what makes it unreachable.
 *
 * The important property is not that this text is good but that it announces
 * itself: if it ever reaches a model, the `enabled` guard has failed, and the
 * reply says so instead of improvising as an expert it is not.
 */
export const NOT_IMPLEMENTED_PROMPT = [
  "【未实现】本专家尚未开放。",
  "",
  "如果你正在阅读这段文字，说明工作台的 enabled 校验被绕过了 —— 这是一个缺陷，",
  "不是一个可以回答的问题。请回复用户：该专家仍在开发中，请在专家列表中另选一位。",
].join("\n");
