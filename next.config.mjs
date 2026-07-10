/** @type {import('next').NextConfig} */
const nextConfig = {
  // The bot and dashboard each have their own lockfile; pin the trace root to this app.
  outputFileTracingRoot: import.meta.dirname,
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
