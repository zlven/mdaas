import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Static export is a hard requirement, not a preference.
   *
   * There is no server in this architecture (docs/02_TECH_SPEC.md C1). A build
   * that needs a Node runtime to serve would break the zero-cost constraint and
   * the no-secrets-server-side constraint at once.
   *
   * Consequence: no API routes, no middleware, no server actions, no ISR, no
   * dynamic params without generateStaticParams. See AGENT_CODING_PROMPT.md §3.7.
   */
  output: "export",

  /**
   * The Next.js image optimizer is a server feature and does not exist in a
   * static export. All images are unoptimized as a result.
   */
  images: {
    unoptimized: true,
  },

  /**
   * Emit `page/index.html` rather than `page.html`, so static hosts serve clean
   * URLs without rewrite rules.
   */
  trailingSlash: true,
};

export default nextConfig;
