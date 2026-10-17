/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The preview renders synthetic fixtures only. Image optimisation is off so
  // there is no optimiser service to reach, and the tracing root is pinned to
  // this directory so a build here can never sweep in the live app's server
  // files or its environment.
  images: { unoptimized: true },
  // The Next dev overlay sits bottom-left and covers the sidebar's viewer row
  // in a screenshot. It is a dev-server artifact, not part of the preview.
  devIndicators: false,
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
