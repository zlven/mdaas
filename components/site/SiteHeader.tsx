import Link from "next/link";

/**
 * Site header — docs/03_UI_UX_SPEC.md §3, and the §3.4 requirement in
 * docs/01_PRD.md that Settings is reachable from every page a visitor can reach
 * before they have a key.
 *
 * Sticky because the workspace's rails scroll and the way back to the grid
 * should not.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-6">
        <Link
          href="/"
          className="text-h3 font-semibold text-ink transition-opacity duration-150 ease-out hover:opacity-70"
        >
          AI 超级专家
        </Link>

        <nav className="ml-auto flex items-center gap-6 text-small">
          {/* Named explicitly rather than relying on the brand link. A wordmark
              does not read as "this goes home", and a visitor who has walked into
              the directory has no other way back to the hero. */}
          <Link href="/" className="text-ink-muted transition-colors duration-150 ease-out hover:text-ink">
            首页
          </Link>
          <Link href="/agents/" className="text-ink-muted transition-colors duration-150 ease-out hover:text-ink">
            专家
          </Link>
          <Link href="/settings/" className="text-ink-muted transition-colors duration-150 ease-out hover:text-ink">
            设置
          </Link>
        </nav>
      </div>
    </header>
  );
}
