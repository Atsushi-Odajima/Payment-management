const isProd = process.env.NODE_ENV === "production";

// Next.js App Router injects inline bootstrap scripts, so 'unsafe-inline' is
// the pragmatic baseline for script-src; nonces would need a custom
// middleware rewrite. Dev needs 'unsafe-eval' for React Refresh.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Standalone output keeps the Docker runtime image to .next/standalone + static.
  // Opt-in via env so plain `next start` (Vercel, local) does not warn.
  ...(process.env.NEXT_OUTPUT_STANDALONE === "1" ? { output: "standalone" } : {}),
  // The PDF routes read the bundled Noto Sans JP subset at runtime (lib/pdf/document.ts);
  // include the font files in the traced serverless bundles.
  experimental: {
    outputFileTracingIncludes: { "/api/**/*": ["./lib/pdf/fonts/*.ttf", "./node_modules/harfbuzzjs/hb-subset.wasm"] },
    // The HarfBuzz subsetter loads its .wasm from disk with require.resolve; keep it out of the webpack bundle.
    serverComponentsExternalPackages: ["subset-font", "harfbuzzjs", "fontverter"],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

module.exports = nextConfig;
