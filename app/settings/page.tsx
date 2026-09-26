import type { Metadata } from "next";

import { SettingsForm } from "@/components/settings/SettingsForm";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";

/**
 * Settings — docs/01_PRD.md §3.4.
 *
 * Reachable from every page a visitor can reach before they have a key, which is
 * why the header carries it rather than a menu.
 *
 * A server component wrapping the client form, so the page can carry a title
 * while the form keeps its state.
 */

export const metadata: Metadata = {
  title: "设置",
};

export default function SettingsPage() {
  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-6 py-16">
        <h1 className="text-h1 font-semibold text-ink">设置</h1>
        <p className="mt-3 max-w-xl text-body text-ink-muted">
          这个平台不提供模型。填一个你自己的服务商 Key，就能和任何一位专家对话。
        </p>

        <div className="mt-12">
          <SettingsForm />
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
