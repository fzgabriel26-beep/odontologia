'use client';

import { AgendaBoard } from '@/components/agenda/agenda-board';

/**
 * Agenda de turnos (SDD §11 / fase 8): vista diaria con navegación, filtro
 * por profesional y acciones de estado, seña, edición e historial.
 */
export default function AgendaPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Agenda</h1>
        <p className="text-sm text-muted-foreground">
          Turnos del día con estados, señas e historial. Los turnos nunca se borran: se cancelan,
          marcan ausentes o reprograman con motivo.
        </p>
      </header>

      <AgendaBoard />
    </div>
  );
}
