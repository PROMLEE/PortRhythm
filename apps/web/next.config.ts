import type { NextConfig } from "next";

// Script and style sources are not restricted here: the inline theme script and
// the OCR worker need a nonce-based policy that must be verified in a browser.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      ...["/about", "/guide", "/llms-full.txt"].map((source) => ({
        source,
        headers: [{ key: "Link", value: '</llms.txt>; rel="describedby"' }],
      })),
      ...["/llms.txt", "/llms-full.txt"].map((source) => ({
        source,
        headers: [{ key: "Content-Type", value: "text/plain; charset=utf-8" }],
      })),
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
