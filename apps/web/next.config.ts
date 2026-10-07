import type { NextConfig } from "next"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp"],
  outputFileTracingRoot: repoRoot,
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "sitebot/application": path.join(repoRoot, "src/application/index.ts"),
    }
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
    }
    return config
  },
}

export default nextConfig
