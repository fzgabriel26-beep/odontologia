'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ROLE_LABELS, type Role } from '@odonto/types';
import { AppSessionProvider, useAppSession } from '@/components/app-session';
import { Button } from '@/components/ui/button';

interface NavItem {
  href: string;
  label: string;
  /** Permiso requerido para ver el enlace (el backend también lo exige). */
  permission?: string;
}

/**
 * Navegación lateral del sistema (SDD §11). Los ítems administrativos solo
 * aparecen si el usuario tiene el permiso; el backend los protege igual.
 */
const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/usuarios', label: 'Usuarios', permission: 'users.manage' },
  { href: '/codigos', label: 'Códigos de invitación', permission: 'invitation.manage' },
];

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={
        active
          ? 'rounded-md bg-secondary px-3 py-2 text-sm font-medium text-foreground'
          : 'rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
      }
    >
      {item.label}
    </Link>
  );
}

/** Chrome autenticado: sidebar + header con usuario y cierre de sesión. */
function AppChrome({ children }: { children: ReactNode }) {
  const { user, loading, logout, can } = useAppSession();
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50">
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </main>
    );
  }

  const visibleItems = NAV_ITEMS.filter((item) => !item.permission || can(item.permission));
  const roleLabel = ROLE_LABELS[user.role.key as Role] ?? user.role.name;

  const handleLogout = async (): Promise<void> => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-neutral-50">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-background md:flex">
        <div className="border-b px-4 py-4">
          <p className="text-sm font-semibold leading-tight">Sistema de Gestión</p>
          <p className="text-sm font-semibold leading-tight">Odontológica</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Navegación principal">
          {visibleItems.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
            />
          ))}
        </nav>
        <div className="border-t p-3">
          <p className="truncate px-3 text-xs text-muted-foreground">{user.email}</p>
          <p className="px-3 text-xs font-medium">{roleLabel}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b bg-background px-4">
          <button
            type="button"
            className="rounded-md border px-2 py-1 text-sm md:hidden"
            onClick={() => setMobileNavOpen((open) => !open)}
            aria-expanded={mobileNavOpen}
            aria-label="Mostrar navegación"
          >
            ☰
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {user.firstName} {user.lastName}
            </p>
            <p className="truncate text-xs text-muted-foreground">{roleLabel}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleLogout()}
            disabled={loggingOut}
          >
            {loggingOut ? 'Saliendo…' : 'Cerrar sesión'}
          </Button>
        </header>

        {mobileNavOpen ? (
          <nav
            className="flex flex-col gap-1 border-b bg-background p-3 md:hidden"
            aria-label="Navegación principal (móvil)"
          >
            {visibleItems.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
                onNavigate={() => setMobileNavOpen(false)}
              />
            ))}
          </nav>
        ) : null}

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

/**
 * Layout del área autenticada (route group `(app)`): sidebar, header con el
 * usuario y cierre de sesión. Protege todas las rutas hijas.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppSessionProvider>
      <AppChrome>{children}</AppChrome>
    </AppSessionProvider>
  );
}
