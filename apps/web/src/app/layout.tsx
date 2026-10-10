import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import './globals.css';

/**
 * Tipografía del diseño de referencia (dashboard analítico): sans limpia,
 * servida self-hosted por next/font (sin pedidos a CDNs en runtime, la CSP
 * del sitio sigue intacta).
 */
const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: 'Sistema de Gestión Odontológica',
  description: 'Gestión de consultorio odontológico: pacientes, historia clínica y agenda.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
