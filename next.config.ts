import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 é binário nativo — não pode ser bundleado (usado pelo
  // Prisma no middleware, que roda em runtime nodejs mas com bundler próprio)
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
