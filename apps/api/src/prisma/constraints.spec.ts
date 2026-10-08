import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

/**
 * Tests de integridad contra PostgreSQL real (SDD, fase 1):
 * constraints de unicidad y relaciones Restrict que impiden la
 * eliminación física de información clínica.
 *
 * Requiere la base migrada (`pnpm db:migrate`) y el seed ejecutado.
 * Cada test crea y elimina sus propios datos.
 */

// Busca el .env según el cwd (raíz del monorepo o apps/api).
const envPath = ['../../.env', '../.env', '.env']
  .map((candidate) => resolve(process.cwd(), candidate))
  .find((candidate) => existsSync(candidate));

if (envPath) {
  config({ path: envPath });
}

const uniqueSuffix = (): string => String(Date.now()).slice(-8);

describe('constraints de la base de datos', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL no está definida (revisá .env en la raíz).');
    }
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('rechaza DNI duplicado en pacientes', async () => {
    const dni = `99${uniqueSuffix().slice(0, 6)}`;
    const patient = await prisma.patient.create({
      data: { firstName: 'Test', lastName: 'Constraint', dni },
    });

    try {
      await expect(
        prisma.patient.create({ data: { firstName: 'Otro', lastName: 'Duplicado', dni } }),
      ).rejects.toMatchObject({ code: 'P2002' });
    } finally {
      await prisma.patient.delete({ where: { id: patient.id } });
    }
  });

  it('rechaza email duplicado en usuarios', async () => {
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { key: 'ADMIN' } });
    const suffix = uniqueSuffix();
    const email = `test-${suffix}@consultorio.local`;

    const user = await prisma.user.create({
      data: {
        firstName: 'Test',
        lastName: 'Constraint',
        dni: `70${suffix.slice(0, 6)}`,
        email,
        passwordHash: 'hash-de-prueba-no-utilizable',
        roleId: adminRole.id,
      },
    });

    try {
      await expect(
        prisma.user.create({
          data: {
            firstName: 'Otro',
            lastName: 'Duplicado',
            dni: `71${suffix.slice(0, 6)}`,
            email,
            passwordHash: 'hash-de-prueba-no-utilizable',
            roleId: adminRole.id,
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  it('impide eliminar un paciente con historia clínica (Restrict)', async () => {
    const admin = await prisma.user.findFirstOrThrow({ where: { role: { key: 'ADMIN' } } });
    const patient = await prisma.patient.create({
      data: {
        firstName: 'Test',
        lastName: 'Historia',
        dni: `80${uniqueSuffix().slice(0, 6)}`,
        clinicalRecords: {
          create: {
            date: new Date('2026-10-08'),
            time: '10:00',
            reason: 'Registro de prueba',
            createdById: admin.id,
          },
        },
      },
      include: { clinicalRecords: true },
    });

    try {
      await expect(prisma.patient.delete({ where: { id: patient.id } })).rejects.toMatchObject({
        code: expect.stringMatching(/^P20/),
      });
    } finally {
      await prisma.clinicalRecord.deleteMany({ where: { patientId: patient.id } });
      await prisma.patient.delete({ where: { id: patient.id } });
    }
  });

  it('garantiza un solo registro por paciente y número FDI', async () => {
    const patient = await prisma.patient.create({
      data: { firstName: 'Test', lastName: 'Odontograma', dni: `81${uniqueSuffix().slice(0, 6)}` },
    });

    try {
      await prisma.tooth.create({
        data: { patientId: patient.id, fdiNumber: 36, type: 'PERMANENTE' },
      });

      await expect(
        prisma.tooth.create({ data: { patientId: patient.id, fdiNumber: 36, type: 'PERMANENTE' } }),
      ).rejects.toMatchObject({ code: 'P2002' });
    } finally {
      await prisma.tooth.deleteMany({ where: { patientId: patient.id } });
      await prisma.patient.delete({ where: { id: patient.id } });
    }
  });
});
