'use client';

import { AuditPanel } from '@/components/audit/audit-panel';

/**
 * Panel de auditoría (SDD CU-15 / fase 9): consulta del registro inmutable
 * de acciones sensibles con filtros por acción, usuario y fecha.
 * Solo administradores (audit.read); el backend también lo exige.
 */
export default function AuditPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Auditoría</h1>
        <p className="text-sm text-muted-foreground">
          Registro inmutable de las acciones sensibles del sistema: quién hizo qué y cuándo. Los
          registros nunca se modifican ni se eliminan.
        </p>
      </header>
      <AuditPanel />
    </div>
  );
}
