/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone build copies only the needed node_modules/server files into
  // .next/standalone — keeps the Docker image small and self-contained.
  output: "standalone",
  // The bot and dashboard each have their own lockfile; pin the trace root to this app.
  outputFileTracingRoot: import.meta.dirname,
  experimental: {
    // Keep existing middleware body support for other routes. Creator uploads
    // enforce their own origin/auth checks and stream outside this buffer.
    middlewareClientMaxBodySize: "70mb",
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;

