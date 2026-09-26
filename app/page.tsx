/**
 * Landing page — placeholder.
 *
 * The real landing page is specified in docs/03_UI_UX_SPEC.md §3 and built in a
 * later step. This shell exists so the build pipeline, the Tailwind v4 theme,
 * and the static export can be verified before any product code lands.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-6 py-24">
      <p className="text-micro font-medium tracking-wide text-ink-subtle">
        AI SUPER EXPERT
      </p>

      <h1 className="mt-4 text-display font-semibold text-ink">
        你的 AI 专家团队，
        <br />
        覆盖工作与生活的每一个领域。
      </h1>

      <p className="mt-6 text-h2 font-normal text-ink-muted">
        10 位垂直领域专家。一个智能工作台。
      </p>

      <p className="mt-12 text-small text-ink-subtle">
        页面正在开发中。产品规格见 <code className="font-mono">docs/</code>。
      </p>
    </main>
  );
}
