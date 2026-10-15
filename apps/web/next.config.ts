import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  /** Smaller self-host / Docker images (Dockerfile.web). */
  output: "standalone",
  /** Monorepo: include workspace packages in the standalone trace. */
  outputFileTracingRoot: path.join(appDir, "../.."),
};

export default nextConfig;
