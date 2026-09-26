/**
 * OpenAI-compatible adapter — docs/05_API_SPEC.md §2, §6
 *
 * DeepSeek, Kimi, Doubao, Qwen, Zhipu, local endpoints — anything that speaks
 * the OpenAI chat-completions shape at a user-supplied base URL.
 *
 * The rule for this adapter is **default to requiring the proxy**
 * (02_TECH_SPEC.md §6.1). Most of these providers do not return
 * `Access-Control-Allow-Origin`, so a direct browser call fails; do not assume
 * otherwise without verifying it with a real request. The failure is reported as
 * CORS with the proxy named as the fix, never as a network outage.
 */

import { createOpenAIShapeProvider } from "@/lib/llm/providers/openai-shape";

const compatible = createOpenAIShapeProvider({
  id: "compatible",
  label: "兼容接口",
  // Supplied by the user; there is no sensible default.
  defaultBaseUrl: "",
  allowProxy: true,
  // Third-party endpoints vary in what they accept; stream usage is not assumed.
  sendStreamOptions: false,
});

export default compatible;
