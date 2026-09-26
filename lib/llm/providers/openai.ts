/**
 * OpenAI adapter — docs/05_API_SPEC.md §2
 *
 * The wire format lives in `openai-shape.ts`, shared with `compatible`. This
 * file is only the configuration that makes it OpenAI.
 */

import { createOpenAIShapeProvider } from "@/lib/llm/providers/openai-shape";

const openai = createOpenAIShapeProvider({
  id: "openai",
  label: "OpenAI",
  defaultBaseUrl: "https://api.openai.com/v1",
  // OpenAI allows browser origins, so the proxy is not offered here.
  allowProxy: false,
  // OpenAI attaches usage to the final stream chunk when asked.
  sendStreamOptions: true,
});

export default openai;
