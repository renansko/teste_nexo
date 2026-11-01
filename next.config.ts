import type { NextConfig } from "next";

const config: NextConfig = {
  // Build enxuto para a imagem Docker (ver Dockerfile).
  output: "standalone",
  serverExternalPackages: ["@mastra/core"],
};

export default config;
