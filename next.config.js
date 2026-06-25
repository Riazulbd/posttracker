/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produces a minimal standalone server bundle for small Docker images.
  output: "standalone",
  reactStrictMode: true,
  eslint: {
    // Don't block production builds on lint errors (deploy on the VPS).
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
