/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone build copies only the needed node_modules/server files into
  // .next/standalone — keeps the Docker image small and self-contained.
  output: "standalone",
  // The bot and dashboard each have their own lockfile; pin the trace root to this app.
  outputFileTracingRoot: import.meta.dirname,
  experimental: {
    // Middleware runs on every route and Next buffers its request body, cutting
    // it off at 10MB. Creator onboarding uploads allow up to 66MB per request.
    middlewareClientMaxBodySize: "70mb",
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
