import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PERMANENT_TEETH_FDI, TEMPORARY_TEETH_FDI } from '@odonto/types';
import type {
  CreatePatientInput,
  ListPatientsQueryInput,
  UpdatePatientInput,
} from '@odonto/validation';
import { AuditService } from '../audit/audit.service';
import type { Patient, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Ejecutor de la acción (para auditoría). */
export interface PatientActor {
  id: string;
  ip?: string;
}

/** '' o null → null; undefined → no tocar el campo (Prisma lo ignora). */
function toDbText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value === '' ? null : value;
}

/** Normaliza fecha ISO opcional a Date (o null) para @db.Date. */
function toDbDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return new Date(value);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

/**
 * Pacientes (SDD, fase 4 / CU-06 y CU-07): alta con 52 dientes FDI (ADR-006,
 * en transacción), edición de ficha, búsqueda y archivado sin borrado físico.
 */
@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async findOrFail(id: string): Promise<Patient> {
    const patient = await this.prisma.patient.findUnique({ where: { id } });
    if (!patient) {
      throw new NotFoundException({
        error: {
          code: 'PATIENT_NOT_FOUND',
          message: 'No existe un paciente con ese identificador.',
        },
      });
    }
    return patient;
  }

  /** Listado con búsqueda opcional (nombre, apellido, DNI, teléfono, email) y filtro de estado. */
  async list(filter: ListPatientsQueryInput): Promise<Patient[]> {
    const query = filter.query?.trim();
    const where: Prisma.PatientWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(query
        ? {
            OR: [
              { firstName: { contains: query, mode: 'insensitive' as const } },
              { lastName: { contains: query, mode: 'insensitive' as const } },
              { dni: { contains: query } },
              { phone: { contains: query } },
              { email: { contains: query, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    return this.prisma.patient.findMany({
      where,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  async get(id: string): Promise<Patient> {
    return this.findOrFail(id);
  }

  /**
   * Alta de paciente: crea la ficha y sus 52 dientes FDI (32 permanentes +
   * 20 temporales) en una única transacción (ADR-006).
   */
  async create(input: CreatePatientInput, actor: PatientActor): Promise<Patient> {
    const existing = await this.prisma.patient.findUnique({ where: { dni: input.dni } });
    if (existing) {
      throw new ConflictException({
        error: { code: 'DNI_TAKEN', message: 'Ya existe un paciente con ese DNI.' },
      });
    }

    let patient: Patient;
    try {
      patient = await this.prisma.$transaction(async (tx) => {
        const created = await tx.patient.create({
          data: {
            firstName: input.firstName,
            lastName: input.lastName,
            dni: input.dni,
            birthDate: toDbDate(input.birthDate),
            phone: toDbText(input.phone),
            email: toDbText(input.email),
            address: toDbText(input.address),
            locality: toDbText(input.locality),
            province: toDbText(input.province),
            emergencyContact: toDbText(input.emergencyContact),
            healthInsurer: toDbText(input.healthInsurer),
            memberNumber: toDbText(input.memberNumber),
            allergies: toDbText(input.allergies),
            medications: toDbText(input.medications),
            background: toDbText(input.background),
            notes: toDbText(input.notes),
            status: 'ACTIVO',
            createdById: actor.id,
          },
        });
        await tx.tooth.createMany({
          data: [
            ...PERMANENT_TEETH_FDI.map((fdiNumber) => ({
              patientId: created.id,
              fdiNumber,
              type: 'PERMANENTE' as const,
            })),
            ...TEMPORARY_TEETH_FDI.map((fdiNumber) => ({
              patientId: created.id,
              fdiNumber,
              type: 'TEMPORAL' as const,
            })),
          ],
        });
        return created;
      });
    } catch (error) {
      // Carrera sobre el UNIQUE de DNI: el pre-check cubre el caso normal.
      if (isUniqueViolation(error)) {
        throw new ConflictException({
          error: { code: 'DNI_TAKEN', message: 'Ya existe un paciente con ese DNI.' },
        });
      }
      throw error;
    }

    await this.audit.log({
      userId: actor.id,
      action: 'PATIENT_CREATED',
      entityType: 'PATIENT',
      entityId: patient.id,
      metadata: { dni: patient.dni, lastName: patient.lastName },
      ip: actor.ip,
    });
    return patient;
  }

  /** Edición de la ficha (parcial); DNI nuevo se valida por unicidad. */
  async update(id: string, input: UpdatePatientInput, actor: PatientActor): Promise<Patient> {
    const patient = await this.findOrFail(id);

    if (input.dni !== undefined && input.dni !== patient.dni) {
      const taken = await this.prisma.patient.findUnique({ where: { dni: input.dni } });
      if (taken && taken.id !== id) {
        throw new ConflictException({
          error: { code: 'DNI_TAKEN', message: 'Ya existe un paciente con ese DNI.' },
        });
      }
    }

    const data: Prisma.PatientUpdateInput = {
      ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
      ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
      ...(input.dni !== undefined ? { dni: input.dni } : {}),
      ...(input.birthDate !== undefined ? { birthDate: toDbDate(input.birthDate) } : {}),
      ...(input.phone !== undefined ? { phone: toDbText(input.phone) } : {}),
      ...(input.email !== undefined ? { email: toDbText(input.email) } : {}),
      ...(input.address !== undefined ? { address: toDbText(input.address) } : {}),
      ...(input.locality !== undefined ? { locality: toDbText(input.locality) } : {}),
      ...(input.province !== undefined ? { province: toDbText(input.province) } : {}),
      ...(input.emergencyContact !== undefined
        ? { emergencyContact: toDbText(input.emergencyContact) }
        : {}),
      ...(input.healthInsurer !== undefined
        ? { healthInsurer: toDbText(input.healthInsurer) }
        : {}),
      ...(input.memberNumber !== undefined ? { memberNumber: toDbText(input.memberNumber) } : {}),
      ...(input.allergies !== undefined ? { allergies: toDbText(input.allergies) } : {}),
      ...(input.medications !== undefined ? { medications: toDbText(input.medications) } : {}),
      ...(input.background !== undefined ? { background: toDbText(input.background) } : {}),
      ...(input.notes !== undefined ? { notes: toDbText(input.notes) } : {}),
    };
    if (Object.keys(data).length === 0) {
      throw new BadRequestException({
        error: { code: 'NOTHING_TO_UPDATE', message: 'No hay datos para actualizar.' },
      });
    }

    const updated = await this.prisma.patient.update({ where: { id }, data });
    await this.audit.log({
      userId: actor.id,
      action: 'PATIENT_UPDATED',
      entityType: 'PATIENT',
      entityId: id,
      metadata: { fields: Object.keys(input), dni: updated.dni },
      ip: actor.ip,
    });
    return updated;
  }

  /** Archiva la ficha (soft delete; nunca se borra físicamente). */
  async archive(id: string, actor: PatientActor): Promise<Patient> {
    const patient = await this.findOrFail(id);
    if (patient.status === 'ARCHIVADO') {
      throw new ConflictException({
        error: { code: 'PATIENT_ALREADY_ARCHIVED', message: 'El paciente ya está archivado.' },
      });
    }

    const archived = await this.prisma.patient.update({
      where: { id },
      data: { status: 'ARCHIVADO', archivedAt: new Date() },
    });
    await this.audit.log({
      userId: actor.id,
      action: 'PATIENT_ARCHIVED',
      entityType: 'PATIENT',
      entityId: id,
      metadata: { dni: archived.dni, from: patient.status, to: 'ARCHIVADO' },
      ip: actor.ip,
    });
    return archived;
  }

  /** Reabre una ficha archivada (el paciente volvió al consultorio). */
  async restore(id: string, actor: PatientActor): Promise<Patient> {
    const patient = await this.findOrFail(id);
    if (patient.status === 'ACTIVO') {
      throw new ConflictException({
        error: { code: 'PATIENT_NOT_ARCHIVED', message: 'El paciente no está archivado.' },
      });
    }

    const restored = await this.prisma.patient.update({
      where: { id },
      data: { status: 'ACTIVO', archivedAt: null },
    });
    await this.audit.log({
      userId: actor.id,
      action: 'PATIENT_UPDATED',
      entityType: 'PATIENT',
      entityId: id,
      metadata: { dni: restored.dni, from: 'ARCHIVADO', to: 'ACTIVO' },
      ip: actor.ip,
    });
    return restored;
  }
}
