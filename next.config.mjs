/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone build copies only the needed node_modules/server files into
  // .next/standalone — keeps the Docker image small and self-contained.
  output: "standalone",
  // The bot and dashboard each have their own lockfile; pin the trace root to this app.
  outputFileTracingRoot: import.meta.dirname,
  experimental: {
    // Middleware clones the multipart body before the Server Action reads it.
    // Match the existing action limit so videos above Next's 10 MB default survive.
    middlewareClientMaxBodySize: "50mb",
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;

