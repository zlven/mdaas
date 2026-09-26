"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

import type { ToolProps } from "@/components/tools/types";
import type { ToolId } from "@/lib/tools/types";

/**
 * Tool id → component — docs/04_AGENT_SPEC.md §7
 *
 * Two things are load-bearing here.
 *
 * `Record<ToolId, …>` makes a tool that exists in `TOOL_IDS` but has no component
 * a **compile error**. Together with `AgentConfig.tools` being typed `ToolId`,
 * that closes both directions: a config cannot name a tool that does not exist,
 * and a tool cannot exist without a component. No runtime validation is
 * reachable, which is why `lib/agents/registry.ts` does not try (see the note in
 * `lib/tools/types.ts`).
 *
 * `next/dynamic` keeps a page from carrying every tool in the product. Each
 * becomes its own chunk and is fetched only when the tool is actually opened
 * (`ToolPanel` renders the component on first expand), so the three live agents
 * pay for the one tool each of them declares.
 */

export const TOOL_COMPONENTS: Record<ToolId, ComponentType<ToolProps>> = {
  "food-tef": dynamic(() => import("@/components/tools/FoodTef")),
  "meeting-cost": dynamic(() => import("@/components/tools/MeetingCost")),
  "speaking-time": dynamic(() => import("@/components/tools/SpeakingTime")),
};
