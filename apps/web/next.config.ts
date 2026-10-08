import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Los paquetes del monorepo se consumen ya compilados (dist/).
  transpilePackages: ['@odonto/ui', '@odonto/types', '@odonto/validation'],
};

export default nextConfig;
