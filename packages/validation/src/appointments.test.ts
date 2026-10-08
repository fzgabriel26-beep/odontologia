import { describe, expect, it } from 'vitest';
import {
  appointmentListQuerySchema,
  appointmentStatsQuerySchema,
  changeAppointmentStatusSchema,
  createAppointmentSchema,
  registerSignaSchema,
  updateAppointmentSchema,
} from './appointments';

const patientId = '3f1c9d21-b4e1-4f6a-8c9d-0e2f4a6b8c10';
const professionalId = '4a2d8e32-c5f1-4b7e-9d0a-1f3b5c7d9e11';

const baseCreate = {
  patientId,
  professionalId,
  date: '2026-11-20',
  time: '10:30',
  durationMin: 30,
};

function fieldOf(
  result: ReturnType<typeof createAppointmentSchema.safeParse>,
  path: string,
): string | undefined {
  if (result.success) return undefined;
  return result.error.issues.find((issue) => issue.path.join('.') === path)?.message;
}

describe('createAppointmentSchema', () => {
  it('acepta el mínimo obligatorio', () => {
    const result = createAppointmentSchema.safeParse(baseCreate);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.date).toBe('2026-11-20');
      expect(result.data.durationMin).toBe(30);
      expect(result.data.signaRequired).toBeUndefined();
    }
  });

  it('acepta motivo, observaciones y seña completa', () => {
    const result = createAppointmentSchema.safeParse({
      ...baseCreate,
      reason: 'Control postoperatorio',
      observations: 'Traer radiografías.',
      signaRequired: true,
      signaAmount: 15000,
    });
    expect(result.success).toBe(true);
  });

  it('rechaza hora inválida con mensaje en español', () => {
    const result = createAppointmentSchema.safeParse({ ...baseCreate, time: '9:5' });
    expect(fieldOf(result, 'time')).toBe('Ingresá una hora válida (HH:MM).');
    const hour25 = createAppointmentSchema.safeParse({ ...baseCreate, time: '25:00' });
    expect(fieldOf(hour25, 'time')).toBe('Ingresá una hora válida (HH:MM).');
  });

  it('rechaza fechas inexistentes en el calendario', () => {
    const result = createAppointmentSchema.safeParse({ ...baseCreate, date: '2026-02-30' });
    expect(result.success).toBe(false);
    const format = createAppointmentSchema.safeParse({ ...baseCreate, date: '20-11-2026' });
    expect(result.success).toBe(false);
    expect(format.success).toBe(false);
  });

  it('valida la duración (entera, entre 5 y 480 minutos)', () => {
    expect(createAppointmentSchema.safeParse({ ...baseCreate, durationMin: 4 }).success).toBe(false);
    expect(createAppointmentSchema.safeParse({ ...baseCreate, durationMin: 481 }).success).toBe(
      false,
    );
    expect(createAppointmentSchema.safeParse({ ...baseCreate, durationMin: 30.5 }).success).toBe(
      false,
    );
    expect(createAppointmentSchema.safeParse({ ...baseCreate, durationMin: 5 }).success).toBe(true);
    expect(createAppointmentSchema.safeParse({ ...baseCreate, durationMin: 480 }).success).toBe(
      true,
    );
  });

  it('rechaza uuids inválidos y montos no positivos', () => {
    expect(fieldOf(createAppointmentSchema.safeParse({ ...baseCreate, patientId: '123' }), 'patientId')).toBe(
      'Paciente inválido.',
    );
    expect(
      fieldOf(createAppointmentSchema.safeParse({ ...baseCreate, professionalId: 'x' }), 'professionalId'),
    ).toBe('Profesional inválido.');
    expect(
      createAppointmentSchema.safeParse({ ...baseCreate, signaRequired: true, signaAmount: 0 })
        .success,
    ).toBe(false);
    expect(
      createAppointmentSchema.safeParse({ ...baseCreate, reason: 'x'.repeat(501) }).success,
    ).toBe(false);
  });
});

describe('updateAppointmentSchema', () => {
  it('acepta campos parciales', () => {
    const result = updateAppointmentSchema.safeParse({ time: '11:00', durationMin: 45 });
    expect(result.success).toBe(true);
  });

  it('exige al menos un campo (error en la raíz del formulario)', () => {
    const result = updateAppointmentSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((issue) => issue.path.join('.') === 'form');
      expect(issue?.message).toBe('Enviá al menos un campo para modificar.');
    }
  });

  it('ignora patientId (el paciente de un turno no se cambia por edición)', () => {
    const result = updateAppointmentSchema.safeParse({ patientId, time: '12:00' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('patientId');
      expect(result.data.time).toBe('12:00');
    }
  });
});

describe('changeAppointmentStatusSchema', () => {
  it('acepta una transición simple sin motivo', () => {
    const result = changeAppointmentStatusSchema.safeParse({ status: 'CONFIRMADO' });
    expect(result.success).toBe(true);
  });

  it('exige motivo para CANCELADO, AUSENTE y REPROGRAMADO', () => {
    for (const status of ['CANCELADO', 'AUSENTE', 'REPROGRAMADO']) {
      const result = changeAppointmentStatusSchema.safeParse({ status });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((issue) => issue.path.join('.') === 'reason');
        expect(issue?.message).toBe(
          'El motivo es obligatorio para cancelar, marcar ausente o reprogramar un turno.',
        );
      }
    }
  });

  it('acepta los estados de cierre cuando viene el motivo', () => {
    expect(
      changeAppointmentStatusSchema.safeParse({ status: 'CANCELADO', reason: 'Paciente avisó' })
        .success,
    ).toBe(true);
    expect(
      changeAppointmentStatusSchema.safeParse({ status: 'AUSENTE', reason: 'No se presentó' })
        .success,
    ).toBe(true);
    expect(
      changeAppointmentStatusSchema.safeParse({ status: 'REPROGRAMADO', reason: 'Otro día' })
        .success,
    ).toBe(true);
    expect(
      changeAppointmentStatusSchema.safeParse({ status: 'CANCELADO', reason: '   ' }).success,
    ).toBe(false);
  });

  it('rechaza estados fuera de la lista', () => {
    const result = changeAppointmentStatusSchema.safeParse({ status: 'VOLANDO' });
    expect(result.success).toBe(false);
  });
});

describe('registerSignaSchema', () => {
  const paidComplete = {
    signaPaid: true,
    signaReceived: 15000,
    signaDate: '2026-11-10',
    signaMethod: 'EFECTIVO',
  };

  it('acepta la seña abonada completa', () => {
    const result = registerSignaSchema.safeParse(paidComplete);
    expect(result.success).toBe(true);
  });

  it('exige monto, fecha y método cuando signaPaid es true', () => {
    const result = registerSignaSchema.safeParse({ signaPaid: true });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((issue) => issue.path.join('.') === 'form');
      expect(issue?.message).toBe(
        'Para marcar la seña como abonada completá monto recibido, fecha y método de pago.',
      );
    }
    const partial = registerSignaSchema.safeParse({
      signaPaid: true,
      signaReceived: 15000,
      signaDate: '2026-11-10',
    });
    expect(partial.success).toBe(false);
  });

  it('acepta signaPaid false sin datos de pago (anula la seña)', () => {
    const result = registerSignaSchema.safeParse({ signaPaid: false });
    expect(result.success).toBe(true);
  });

  it('valida monto y método', () => {
    expect(
      registerSignaSchema.safeParse({ ...paidComplete, signaReceived: -100 }).success,
    ).toBe(false);
    expect(
      registerSignaSchema.safeParse({ ...paidComplete, signaMethod: 'CHEQUE' }).success,
    ).toBe(false);
    expect(
      registerSignaSchema.safeParse({ ...paidComplete, signaDate: '10-11-2026' }).success,
    ).toBe(false);
  });
});

describe('consultas de agenda', () => {
  it('acepta el listado con rango y profesional', () => {
    const result = appointmentListQuerySchema.safeParse({
      from: '2026-11-01',
      to: '2026-11-30',
      professionalId,
      status: 'PENDIENTE',
    });
    expect(result.success).toBe(true);
  });

  it('rechaza un rango invertido', () => {
    const result = appointmentListQuerySchema.safeParse({ from: '2026-11-30', to: '2026-11-01' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((issue) => issue.path.join('.') === 'from');
      expect(issue?.message).toBe(
        'El rango de fechas es inválido: "desde" debe ser anterior o igual a "hasta".',
      );
    }
  });

  it('acepta la consulta de estadísticas con o sin fecha', () => {
    expect(appointmentStatsQuerySchema.safeParse({}).success).toBe(true);
    expect(appointmentStatsQuerySchema.safeParse({ date: '2026-11-20' }).success).toBe(true);
    expect(appointmentStatsQuerySchema.safeParse({ date: 'ayer' }).success).toBe(false);
  });
});
