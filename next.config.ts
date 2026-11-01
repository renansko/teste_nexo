import type { NextConfig } from "next";

const config: NextConfig = {
  // Build enxuto para a imagem Docker (ver Dockerfile).
  output: "standalone",
  // @libsql/client traz binário nativo: fica fora do bundle do servidor.
  serverExternalPackages: ["@mastra/core", "@mastra/libsql", "@libsql/client"],
};

export default config;
