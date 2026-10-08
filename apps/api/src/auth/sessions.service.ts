import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { User } from '../generated/prisma/client';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface SessionContext {
  ip?: string;
  userAgent?: string;
}

/** Toma el rol y los permisos del usuario activo para armar el AuthUser. */
function toAuthUser(
  user: User & { role: { key: string; name: string; permissions: unknown } },
  sessionId: string,
): AuthUser {
  const permissions = Array.isArray(user.role.permissions)
    ? user.role.permissions.filter((p): p is string => typeof p === 'string')
    : [];
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    roleKey: user.role.key,
    roleName: user.role.name,
    permissions,
    sessionId,
  };
}

/**
 * Sesiones con token opaco guardado solo como hash (ADR-001).
 * El token en claro vive únicamente en la cookie httpOnly del navegador.
 */
@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  private get ttlMinutes(): number {
    return Number(process.env.SESSION_TTL_MIN ?? 480);
  }

  async create(
    userId: string,
    context: SessionContext,
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.ttlMinutes * 60_000);
    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt,
        ip: context.ip ?? null,
        userAgent: context.userAgent?.slice(0, 255) ?? null,
      },
    });
    return { token, expiresAt };
  }

  /** Valida el token completo: existencia, vigencia, revocación y usuario activo. */
  async validate(token: string): Promise<{ user: AuthUser } | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { include: { role: true } } },
    });
    if (!session) return null;
    if (session.revokedAt !== null) return null;
    if (session.expiresAt.getTime() <= Date.now()) return null;
    if (session.user.status !== 'ACTIVO') return null;
    return { user: toAuthUser(session.user, session.id) };
  }

  /** Revoca la sesión del token dado (logout). Idempotente. */
  async revoke(token: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Revoca todas las sesiones de un usuario, excepto la actual si se indica
   * (se usa al cambiar contraseña: se cierran las demás sesiones).
   */
  async revokeAllForUser(userId: string, exceptSessionId?: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
  }
}
