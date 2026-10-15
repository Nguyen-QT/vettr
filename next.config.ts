import type { NextConfig } from "next";

// Static security headers on every path (53.4.3.1); the nonce CSP is built
// per request in the proxy. X-Frame-Options ships enforced because
// `frame-ancestors` does nothing while the CSP is Report-Only. HSTS has no
// `preload` yet. Permissions-Policy leaves out `payment` (PaymentElement
// wallets) and `publickey-credentials-*` (Phase 59 passkeys) so their
// defaults apply: allowed for self and delegable to Stripe's frames. The
// reset page's `<meta name="referrer">` still overrides Referrer-Policy.
const SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.ufs.sh" },
      { protocol: "https", hostname: "utfs.io" },
    ],
  },
  // Public artist URLs (54.1). A literal `@handle` folder would be a
  // parallel-route slot, so `/@handle` is served from `/at/[handle]`.
  async rewrites() {
    return [
      { source: "/@:handle", destination: "/at/:handle" },
      { source: "/@:handle/book", destination: "/at/:handle/book" },
    ];
  },
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
