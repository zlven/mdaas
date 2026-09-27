const REPO_URL = "https://github.com/zlven/mdaas";

/**
 * Site footer — docs/03_UI_UX_SPEC.md §3.
 *
 * Required content: the repository, the docs, and an honest statement that this
 * is a demo. The demo disclosure is not boilerplate — it is the sentence that
 * tells a visitor the answers here are generated, in a product whose whole
 * argument is that it does not pretend.
 */
export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto max-w-6xl px-6 py-12 text-small text-ink-muted">
        <p className="max-w-2xl">
          这是一个演示项目。九位专家各自带着自己的知识库，都可以对话。回答由 AI
          生成，可能出错——答案里会说明这次有没有引用到知识库，你也可以在右侧看到它实际检索到的片段。
          产品文档和全部源码都在仓库里。
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
