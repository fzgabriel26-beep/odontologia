import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

/**
 * Estado vacío reutilizable para listas y paneles.
 * Se usa, por ejemplo, cuando un paciente aún no tiene turnos o archivos.
 */
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      {description ? <p className="text-sm opacity-70">{description}</p> : null}
      {action}
    </div>
  );
}
