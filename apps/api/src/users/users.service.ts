import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import argon2 from 'argon2';
import type {
  ChangeUserRoleInput,
  ChangeUserStatusInput,
  CreateUserInput,
  UpdateUserInput,
} from '@odonto/validation';
import { AuditService } from '../audit/audit.service';
import { SessionsService } from '../auth/sessions.service';
import { PrismaService } from '../prisma/prisma.service';
import type { User } from '../generated/prisma/client';

type UserWithRole = User & { role: { key: string; name: string } };

/** Vista de usuario para el panel de administración (nunca incluye hash). */
export interface AdminUserView {
  id: string;
  firstName: string;
  lastName: string;
  dni: string;
  email: string;
  role: { key: string; name: string };
  status: 'ACTIVO' | 'INACTIVO';
  lastLoginAt: Date | null;
  createdAt: Date;
}

/** Ejecutor de la acción administrativa (para auditoría). */
export interface AdminActor {
  id: string;
  ip?: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sessions: SessionsService,
  ) {}

  private toView(user: {
    id: string;
    firstName: string;
    lastName: string;
    dni: string;
    email: string;
    status: string;
    lastLoginAt: Date | null;
    createdAt: Date;
    role: { key: string; name: string };
  }): AdminUserView {
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      dni: user.dni,
      email: user.email,
      role: { key: user.role.key, name: user.role.name },
      status: user.status as 'ACTIVO' | 'INACTIVO',
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    };
  }

  private async findOrFail(id: string): Promise<UserWithRole> {
    const user = await this.prisma.user.findUnique({ where: { id }, include: { role: true } });
    if (!user) {
      throw new NotFoundException({
        error: { code: 'USER_NOT_FOUND', message: 'No existe un usuario con ese identificador.' },
      });
    }
    return user;
  }

  /** Listado con búsqueda opcional por nombre, email o DNI. */
  async list(query?: string): Promise<AdminUserView[]> {
    const trimmed = query?.trim();
    const where = trimmed
      ? {
          OR: [
            { email: { contains: trimmed, mode: 'insensitive' as const } },
            { firstName: { contains: trimmed, mode: 'insensitive' as const } },
            { lastName: { contains: trimmed, mode: 'insensitive' as const } },
            { dni: { contains: trimmed } },
          ],
        }
      : undefined;

    const users = await this.prisma.user.findMany({
      where,
      include: { role: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return users.map((user) => this.toView(user));
  }

  async get(id: string): Promise<AdminUserView> {
    return this.toView(await this.findOrFail(id));
  }

  /** Alta directa por administrador (no usa código de invitación). */
  async create(input: CreateUserInput, actor: AdminActor): Promise<AdminUserView> {
    await this.assertUniqueCredentials(input.email, input.dni);

    const role = await this.prisma.role.findUnique({ where: { key: input.roleKey } });
    if (!role) {
      throw new BadRequestException({
        error: { code: 'ROLE_NOT_FOUND', message: 'El rol indicado no existe.' },
      });
    }

    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        dni: input.dni,
        status: 'ACTIVO',
        roleId: role.id,
      },
      include: { role: true },
    });

    await this.audit.log({
      userId: actor.id,
      action: 'USER_CREATED',
      entityType: 'USER',
      entityId: user.id,
      metadata: { email: user.email, roleKey: input.roleKey, via: 'admin' },
      ip: actor.ip,
    });
    return this.toView(user);
  }

  /** Edición de datos personales (rol y estado tienen endpoints propios). */
  async update(id: string, input: UpdateUserInput, actor: AdminActor): Promise<AdminUserView> {
    const user = await this.findOrFail(id);

    if (input.email !== undefined && input.email !== user.email) {
      await this.assertUniqueCredentials(input.email, undefined, id);
    }
    if (input.dni !== undefined && input.dni !== user.dni) {
      await this.assertUniqueCredentials(undefined, input.dni, id);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
        ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.dni !== undefined ? { dni: input.dni } : {}),
      },
      include: { role: true },
    });

    await this.audit.log({
      userId: actor.id,
      action: 'USER_UPDATED',
      entityType: 'USER',
      entityId: id,
      metadata: { fields: Object.keys(input), email: updated.email },
      ip: actor.ip,
    });
    return this.toView(updated);
  }

  /** Activar/desactivar cuenta; al desactivar se cierran sus sesiones. */
  async changeStatus(
    id: string,
    input: ChangeUserStatusInput,
    actor: AdminActor,
  ): Promise<AdminUserView> {
    const user = await this.findOrFail(id);
    if (id === actor.id) {
      throw new ConflictException({
        error: { code: 'SELF_ACTION_FORBIDDEN', message: 'No podés cambiar tu propio estado.' },
      });
    }
    if (user.role.key === 'ADMIN' && input.status === 'INACTIVO') {
      await this.assertAnotherActiveAdminExists(id);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { status: input.status },
      include: { role: true },
    });
    if (input.status === 'INACTIVO') {
      await this.sessions.revokeAllForUser(id);
    }

    await this.audit.log({
      userId: actor.id,
      action: 'USER_STATUS_CHANGED',
      entityType: 'USER',
      entityId: id,
      metadata: { email: user.email, from: user.status, to: input.status },
      ip: actor.ip,
    });
    return this.toView(updated);
  }

  /** Cambio de rol (SDD CU-05). */
  async changeRole(
    id: string,
    input: ChangeUserRoleInput,
    actor: AdminActor,
  ): Promise<AdminUserView> {
    const user = await this.findOrFail(id);
    if (id === actor.id) {
      throw new ConflictException({
        error: { code: 'SELF_ACTION_FORBIDDEN', message: 'No podés cambiar tu propio rol.' },
      });
    }

    const role = await this.prisma.role.findUnique({ where: { key: input.roleKey } });
    if (!role) {
      throw new BadRequestException({
        error: { code: 'ROLE_NOT_FOUND', message: 'El rol indicado no existe.' },
      });
    }
    if (user.role.key === 'ADMIN' && input.roleKey !== 'ADMIN') {
      await this.assertAnotherActiveAdminExists(id);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { roleId: role.id },
      include: { role: true },
    });

    await this.audit.log({
      userId: actor.id,
      action: 'USER_ROLE_CHANGED',
      entityType: 'USER',
      entityId: id,
      metadata: { email: user.email, from: user.role.key, to: input.roleKey },
      ip: actor.ip,
    });
    return this.toView(updated);
  }

  /**
   * Reset de contraseña por administrador (ADR-005): no exige la contraseña
   * actual y cierra todas las sesiones del usuario.
   */
  async resetPassword(id: string, password: string, actor: AdminActor): Promise<void> {
    const user = await this.findOrFail(id);
    if (id === actor.id) {
      throw new ConflictException({
        error: {
          code: 'SELF_ACTION_FORBIDDEN',
          message: 'Para cambiar tu contraseña usá la opción de tu perfil.',
        },
      });
    }

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    await this.sessions.revokeAllForUser(id);

    await this.audit.log({
      userId: actor.id,
      action: 'PASSWORD_RESET_BY_ADMIN',
      entityType: 'USER',
      entityId: id,
      metadata: { email: user.email },
      ip: actor.ip,
    });
  }

  private async assertUniqueCredentials(
    email?: string,
    dni?: string,
    excludeUserId?: string,
  ): Promise<void> {
    if (email) {
      const taken = await this.prisma.user.findUnique({ where: { email } });
      if (taken && taken.id !== excludeUserId) {
        throw new ConflictException({
          error: { code: 'EMAIL_TAKEN', message: 'Ya existe una cuenta con ese email.' },
        });
      }
    }
    if (dni) {
      const taken = await this.prisma.user.findUnique({ where: { dni } });
      if (taken && taken.id !== excludeUserId) {
        throw new ConflictException({
          error: { code: 'DNI_TAKEN', message: 'Ya existe una cuenta con ese DNI.' },
        });
      }
    }
  }

  /** Siempre debe quedar al menos un administrador activo además del objetivo. */
  private async assertAnotherActiveAdminExists(excludeUserId: string): Promise<void> {
    const activeAdmins = await this.prisma.user.count({
      where: { status: 'ACTIVO', role: { key: 'ADMIN' }, id: { not: excludeUserId } },
    });
    if (activeAdmins === 0) {
      throw new ConflictException({
        error: {
          code: 'LAST_ADMIN',
          message: 'Debe quedar al menos un administrador activo en el sistema.',
        },
      });
    }
  }
}
