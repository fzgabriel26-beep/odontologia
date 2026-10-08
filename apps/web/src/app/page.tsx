import Link from 'next/link';
import { EmptyState } from '@odonto/ui';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Pantalla inicial sin sesión (SDD §11).
 *
 * Solo puede ofrecer: iniciar sesión, registrarse con código de invitación y
 * recuperar contraseña. No se muestra ninguna información del consultorio
 * (pacientes, agenda, historias clínicas, etc.).
 */
export default function PublicLandingPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <header className="text-center">
          <h1 className="text-xl font-semibold">Sistema de Gestión Odontológica</h1>
          <p className="mt-1 text-sm opacity-70">Acceso restringido al personal autorizado.</p>
        </header>

        <EmptyState
          title="Iniciar sesión"
          description="Ingresá con tu email y contraseña."
          action={
            <Link href="/login" className={cn(buttonVariants({ size: 'default' }), 'mt-2')}>
              Ir al login
            </Link>
          }
        />

        <div className="flex items-center justify-center gap-4 text-sm">
          <Link
            href="/registro"
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            Crear cuenta con código
          </Link>
          <span className="opacity-40">·</span>
          <Link
            href="/recuperar"
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            Recuperar contraseña
          </Link>
        </div>
      </div>
    </main>
  );
}
