import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateClinicalRecordInput } from '@odonto/validation';
import { AuditService } from '../audit/audit.service';
import type { ClinicalRecord } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Ejecutor de la acción (para auditoría). */
export interface ClinicalRecordActor {
  id: string;
  ip?: string;
}

/** Registro de evolución incluyendo el autor (SDD, fase 5: "autor" visible). */
export type ClinicalRecordWithAuthor = ClinicalRecord & {
  createdBy: { id: string; firstName: string; lastName: string };
};

const AUTHOR_SELECT = { id: true, firstName: true, lastName: true } as const;

/** '' o null → null; undefined → no tocar el campo (Prisma lo ignora). */
function toDbText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value === '' ? null : value;
}

/**
 * Historia clínica (SDD, fase 5 / CU-08): evoluciones por paciente con motivo,
 * diagnóstico, tratamiento, observaciones, indicaciones y dientes FDI.
 * Los registros nunca se borran físicamente: se archivan (insert-only en audit).
 */
@Injectable()
export class ClinicalRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async findPatientOrFail(patientId: string): Promise<void> {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true },
    });
    if (!patient) {
      throw new NotFoundException({
        error: {
          code: 'PATIENT_NOT_FOUND',
          message: 'No existe un paciente con ese identificador.',
        },
      });
    }
  }

  /** Evoluciones del paciente (sin archivadas), más recientes primero. */
  async list(patientId: string): Promise<ClinicalRecordWithAuthor[]> {
    await this.findPatientOrFail(patientId);
    return this.prisma.clinicalRecord.findMany({
      where: { patientId, archivedAt: null },
      orderBy: [{ date: 'desc' }, { time: 'desc' }],
      include: { createdBy: { select: AUTHOR_SELECT } },
    });
  }

  async create(
    patientId: string,
    input: CreateClinicalRecordInput,
    actor: ClinicalRecordActor,
  ): Promise<ClinicalRecordWithAuthor> {
    await this.findPatientOrFail(patientId);
    // El default [] lo aplica el Zod pipe en HTTP; acá se normaliza por robustez
    // (las llamadas directas al servicio podrían omitir el campo).
    const toothNumbers: number[] = input.toothNumbers ?? [];

    const record = await this.prisma.clinicalRecord.create({
      data: {
        patientId,
        date: new Date(input.date),
        time: input.time,
        reason: toDbText(input.reason),
        diagnosis: toDbText(input.diagnosis),
        treatment: toDbText(input.treatment),
        observations: toDbText(input.observations),
        indications: toDbText(input.indications),
        toothNumbers,
        createdById: actor.id,
      },
      include: { createdBy: { select: AUTHOR_SELECT } },
    });

    // Auditoría sin contenido clínico sensible (SDD §7).
    await this.audit.log({
      userId: actor.id,
      action: 'CLINICAL_RECORD_CREATED',
      entityType: 'CLINICAL_RECORD',
      entityId: record.id,
      metadata: { patientId, date: input.date, toothCount: toothNumbers.length },
      ip: actor.ip,
    });
    return record;
  }

  /**
   * Archiva una evolución (soft delete; el registro permanece en base y en
   * auditoría). El registro debe pertenecer al paciente de la ruta.
   */
  async archive(
    patientId: string,
    recordId: string,
    actor: ClinicalRecordActor,
  ): Promise<ClinicalRecordWithAuthor> {
    const record = await this.prisma.clinicalRecord.findFirst({
      where: { id: recordId, patientId },
    });
    if (!record) {
      throw new NotFoundException({
        error: {
          code: 'CLINICAL_RECORD_NOT_FOUND',
          message: 'No existe ese registro clínico para este paciente.',
        },
      });
    }
    if (record.archivedAt) {
      throw new ConflictException({
        error: {
          code: 'CLINICAL_RECORD_ALREADY_ARCHIVED',
          message: 'El registro clínico ya está archivado.',
        },
      });
    }

    const archived = await this.prisma.clinicalRecord.update({
      where: { id: recordId },
      data: { archivedAt: new Date() },
      include: { createdBy: { select: AUTHOR_SELECT } },
    });

    await this.audit.log({
      userId: actor.id,
      action: 'CLINICAL_RECORD_ARCHIVED',
      entityType: 'CLINICAL_RECORD',
      entityId: recordId,
      metadata: { patientId, date: record.date.toISOString().slice(0, 10) },
      ip: actor.ip,
    });
    return archived;
  }
}
