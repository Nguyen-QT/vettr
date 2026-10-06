import type { NextConfig } from "next";

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
};

export default nextConfig;
