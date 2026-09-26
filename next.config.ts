import type { NextConfig } from "next";

/**
 * GitHub Pages project sites are served from a subpath
 * (https://<user>.github.io/<repo>/), not from the domain root.
 *
 * Without a matching basePath, every /_next/... asset URL 404s and the deployed
 * site renders unstyled and inert. This is the single most common way a Next.js
 * static export breaks on Pages.
 *
 * It is read from the environment rather than hardcoded so that:
 *   - local `npm run dev` and `npm run build` serve from the root (unset)
 *   - CI sets it to the repository name
 *   - moving to a custom domain later means unsetting it, not editing code
 *
 * The value must have a leading slash and no trailing slash.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),

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
