/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone build copies only the needed node_modules/server files into
  // .next/standalone — keeps the Docker image small and self-contained.
  output: "standalone",
  // The bot and dashboard each have their own lockfile; pin the trace root to this app.
  outputFileTracingRoot: import.meta.dirname,
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
