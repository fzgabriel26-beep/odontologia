'use client';

import { useMemo } from 'react';
import { AuditList } from './audit-list';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Pestaña "Historial" de la ficha (SDD §11 / fase 9): auditoría del paciente.
 * Incluye las filas cuya entidad es el paciente (PATIENT_*) y las que llevan
 * metadata.patientId (evoluciones, odontograma, archivos, turnos).
 * Requiere audit.read (solo administradores); el resto del personal ve un
 * mensaje de permiso en la propia pestaña.
 */
export function PatientHistory({ patientId }: { patientId: string }) {
  // Params estables: AuditList recarga cuando cambia la referencia.
  const params = useMemo(() => ({ patientId, limit: 20 }), [patientId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Historial de auditoría</CardTitle>
        <p className="text-sm text-muted-foreground">
          Acciones que tocaron esta ficha y sus datos (paciente, historia clínica, odontograma,
          archivos y turnos). El registro es inmutable: nunca se modifica ni se borra.
        </p>
      </CardHeader>
      <CardContent>
        <AuditList params={params} />
      </CardContent>
    </Card>
  );
}
