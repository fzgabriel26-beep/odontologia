import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Los paquetes del monorepo se consumen ya compilados (dist/).
  transpilePackages: ['@odonto/ui', '@odonto/types', '@odonto/validation'],
  // Bundle estático para el escritorio Tauri (ADR-015): la app es 100%
  // client-side contra la API, no necesita servidor Next en producción.
  output: 'export',
  // Cada ruta genera ruta/index.html (resoluble por cualquier servidor de
  // archivos estáticos, incluido el de la webview de Tauri).
  trailingSlash: true,
};

export default nextConfig;
