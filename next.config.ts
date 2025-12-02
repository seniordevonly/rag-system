import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  turbopack: {},
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Externalize canvas-related packages for server-side
      config.externals = config.externals || [];
      config.externals.push({
        canvas: "commonjs canvas",
      });
    }
    return config;
  },
};

export default nextConfig;
