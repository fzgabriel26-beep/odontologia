import { EmptyState } from '@odonto/ui';

/**
 * Pantalla inicial sin sesión (SDD §11).
 *
 * Solo puede ofrecer: iniciar sesión, registrarse con código de invitación y
 * recuperar contraseña. No se muestra ninguna información del consultorio
 * (pacientes, agenda, historias clínicas, etc.).
 *
 * Fase 0: estructura base. Las rutas /login, /registro y /recuperar se
 * implementan en la fase 2 (Autenticación).
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
            <a
              href="/login"
              className="mt-2 rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:opacity-90"
            >
              Ir al login
            </a>
          }
        />
      </div>
    </main>
  );
}
