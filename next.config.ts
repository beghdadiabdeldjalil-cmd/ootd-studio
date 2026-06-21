import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["canvas", "jsdom"],
};

export default nextConfig;
