import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "AI 超级专家",
    template: "%s · AI 超级专家",
  },
  description:
    "9 位垂直领域 AI 专家，覆盖工作与生活的每一个领域。每位专家有自己的知识库与工作流。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
