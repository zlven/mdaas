import Link from "next/link";

import { AgentGrid } from "@/components/agent/AgentGrid";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { buttonClass } from "@/components/ui/Button";
import { listAgents } from "@/lib/agents/registry";

/**
 * Landing — docs/03_UI_UX_SPEC.md §3.
 *
 * Two constraints shape this file:
 *
 *   1. **The grid begins above the fold on a 1440×900 screen.** It is the
 *      product and it is the argument, so the hero is deliberately short — no
 *      full-height hero section, no scroll before the cards.
 *   2. **No hero illustration, no stock imagery, no abstract shapes.** Type and
 *      space only. Emoji appear on cards because they identify agents; they are
 *      not decoration and do not belong in the surrounding copy.
 */

/** The product thesis, compressed to four beats (docs/03_UI_UX_SPEC.md §3). */
const BEATS = [
  {
    title: "选专家",
    body: "九位垂直领域专家，各自带着自己的知识库和回答方式。",
  },
  {
    title: "给任务",
    body: "把要交出去的东西丢进来：会议记录、草稿、一份看不完的长文档。",
  },
  {
    title: "查知识",
    body: "提问时先在这位专家自己的知识库里检索，命中的片段会摊开给你看。",
  },
  {
    title: "出结果",
    body: "直接能用的交付物，不是一串还需要你自己动手的建议。",
  },
];

export default function Home() {
  const agents = listAgents();

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-6">
        <section className="pt-16 pb-12">
          <p className="text-micro font-medium tracking-wide text-ink-subtle">AI SUPER EXPERT</p>

          <h1 className="mt-4 text-display font-semibold text-ink">
            你的 AI 专家团队，
            <br />
            覆盖工作与生活的每一个领域。
          </h1>

          <p className="mt-6 max-w-xl text-body text-ink-muted">
            {agents.length} 位垂直领域专家。一个智能工作台。
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-6">
            <Link href="/agents/" className={buttonClass("primary")}>
              浏览专家
            </Link>
            <a href="#byok" className="text-small font-medium text-ink underline decoration-line-strong underline-offset-4 transition-colors duration-150 ease-out hover:decoration-ink">
              了解 BYOK
            </a>
          </div>
        </section>

        <section aria-labelledby="matrix-heading" className="pt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <h2 id="matrix-heading" className="text-h2 font-semibold text-ink">
              AI 专家矩阵
            </h2>
            {/* The §9 identity disclosure, stated once on the landing page and
                not as a dismissible notice — a dismissed disclosure is not a
                disclosure. */}
            <p className="text-small text-ink-muted">每一位专家都是 AI 智能体，不是真人。</p>
          </div>

          <div className="mt-8">
            <AgentGrid agents={agents} />
          </div>
        </section>

        <section aria-labelledby="beats-heading" className="py-24">
          <h2 id="beats-heading" className="sr-only">
            怎么用
          </h2>

          <ol className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {BEATS.map((beat, i) => (
              <li key={beat.title}>
                <p className="text-micro font-medium text-ink-subtle">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-3 text-h3 font-semibold text-ink">{beat.title}</h3>
                <p className="mt-2 text-small text-ink-muted">{beat.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="byok" aria-labelledby="byok-heading" className="scroll-mt-24 pb-8">
          <div className="max-w-2xl rounded-[var(--radius-lg)] border border-line bg-surface p-8">
            <h2 id="byok-heading" className="text-h2 font-semibold text-ink">
              自带模型 Key（BYOK）
            </h2>

            <p className="mt-4 text-body text-ink-muted">
              平台不提供模型，也不经手你的 API Key。你在设置里填自己的 Key，它保存在这个浏览器里；
              每次对话，请求从你的浏览器直接发给你选的那家服务商。
            </p>

            <p className="mt-4 text-body text-ink-muted">
              所以要提前说清楚两件事：费用走你自己的服务商账户；Key 在浏览器里没有加密，换一台设备要重新填。
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
