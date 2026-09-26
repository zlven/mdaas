const REPO_URL = "https://github.com/zlven/mdaas";

/**
 * Site footer — docs/03_UI_UX_SPEC.md §3.
 *
 * Required content: the repository, the docs, and an honest statement that this
 * is a demo. The demo disclosure is not boilerplate — seven of the ten cards on
 * the landing page are inert, and a visitor should know that before concluding
 * the product is broken.
 */
export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto max-w-6xl px-6 py-12 text-small text-ink-muted">
        <p className="max-w-2xl">
          这是一个演示项目。十位专家里，办公、自媒体、健身三位已经建好知识库，可以对话；其余七位还在开发中，
          卡片上标着「开发中」。产品文档和全部源码都在仓库里。
        </p>

        <p className="mt-4">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="text-ink underline decoration-line-strong underline-offset-4 transition-colors duration-150 ease-out hover:decoration-ink"
          >
            github.com/zlven/mdaas
          </a>
        </p>
      </div>
    </footer>
  );
}
