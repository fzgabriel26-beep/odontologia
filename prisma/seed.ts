import 'dotenv/config';
import argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../apps/api/src/generated/prisma/client';

/**
 * Seed inicial (SDD, fase 1):
 *  - Roles con permisos granulares (base del RBAC; MVP: admin vs personal).
 *  - Usuario administrador inicial (credenciales por variables de entorno).
 *
 * Idempotente: se puede ejecutar más de una vez sin duplicar datos.
 */

const STAFF_PERMISSIONS = [
  'patients.read',
  'patients.write',
  'clinical.read',
  'clinical.write',
  'odontogram.read',
  'odontogram.write',
  'files.read',
  'files.write',
  'appointments.read',
  'appointments.write',
] as const;

const ADMIN_PERMISSIONS = [
  ...STAFF_PERMISSIONS,
  'users.manage',
  'invitation.manage',
  'audit.read',
  'settings.manage',
] as const;

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL no está definida (revisá el archivo .env).');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const roles: Array<{ key: string; name: string; permissions: readonly string[] }> = [
      { key: 'ADMIN', name: 'Administrador', permissions: ADMIN_PERMISSIONS },
      { key: 'ODONTOLOGO', name: 'Odontólogo/a', permissions: STAFF_PERMISSIONS },
      { key: 'SECRETARIO', name: 'Secretario/a', permissions: STAFF_PERMISSIONS },
    ];

    for (const role of roles) {
      await prisma.role.upsert({
        where: { key: role.key },
        update: { name: role.name, permissions: [...role.permissions] },
        create: { key: role.key, name: role.name, permissions: [...role.permissions] },
      });
    }

    const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@consultorio.local';
    const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });

    if (existingAdmin) {
      console.warn(`Administrador ya existente: ${adminEmail}`);
    } else {
      const adminRole = await prisma.role.findUniqueOrThrow({ where: { key: 'ADMIN' } });
      const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin1234!';

      await prisma.user.create({
        data: {
          firstName: 'Administrador',
          lastName: 'Inicial',
          dni: '00000000',
          email: adminEmail,
          passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
          roleId: adminRole.id,
        },
      });

      console.warn(
        `Administrador creado: ${adminEmail}. ` +
          'Cambialá la contraseña en cuanto inicies sesión.',
      );
    }

    console.warn('Seed completado (roles + administrador).');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
