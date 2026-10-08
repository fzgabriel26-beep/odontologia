'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { SessionUser } from '@odonto/types';
import { apiFetch, fetchMe } from '@/lib/api';

interface AppSessionValue {
  /** Usuario de la sesión vigente (null mientras carga o sin sesión). */
  user: SessionUser | null;
  loading: boolean;
  /** Vuelve a pedir /auth/me (tras editar datos propios, por ejemplo). */
  refresh: () => Promise<void>;
  /** Cierra la sesión y vuelve al login. */
  logout: () => Promise<void>;
  /** Indica si el usuario tiene el permiso dado (el backend siempre revalida). */
  can: (permission: string) => boolean;
}

const AppSessionContext = createContext<AppSessionValue | null>(null);

/**
 * Proveedor de sesión de las pantallas autenticadas (route group `(app)`).
 * Protege el árbol completo: sin sesión válida redirige al login.
 */
export function AppSessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void fetchMe().then((session) => {
      if (!active) return;
      if (!session) {
        router.replace('/login');
        return;
      }
      setUser(session);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [router]);

  const refresh = async (): Promise<void> => {
    const session = await fetchMe();
    if (!session) {
      router.replace('/login');
      return;
    }
    setUser(session);
  };

  const logout = async (): Promise<void> => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } finally {
      router.replace('/login');
    }
  };

  const can = (permission: string): boolean => user?.permissions.includes(permission) ?? false;

  return (
    <AppSessionContext.Provider value={{ user, loading, refresh, logout, can }}>
      {children}
    </AppSessionContext.Provider>
  );
}

export function useAppSession(): AppSessionValue {
  const context = useContext(AppSessionContext);
  if (!context) {
    throw new Error('useAppSession debe usarse dentro de <AppSessionProvider>.');
  }
  return context;
}
