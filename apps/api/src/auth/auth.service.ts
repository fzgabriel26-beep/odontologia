import { randomBytes, createHash } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import argon2 from 'argon2';
import type { User } from '../generated/prisma/client';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from '@odonto/validation';
import { AuditService } from '../audit/audit.service';
import { MAIL_PROVIDER, type MailProvider } from '../notifications/mail.provider';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsService, type SessionContext } from './sessions.service';
import { primaryWebOrigin } from '../common/utils/origins';

const GENERIC_LOGIN_ERROR = 'Email o contraseña incorrectos.';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface PublicUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: { key: string; name: string };
  permissions: string[];
}

export interface AuthResult {
  user: PublicUser;
  token: string;
  expiresAt: Date;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly audit: AuditService,
    @Inject(MAIL_PROVIDER) private readonly mail: MailProvider,
  ) {}

  private toPublicUser(
    user: User & { role: { key: string; name: string; permissions: unknown } },
  ): PublicUser {
    const permissions = Array.isArray(user.role.permissions)
      ? user.role.permissions.filter((p): p is string => typeof p === 'string')
      : [];
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: { key: user.role.key, name: user.role.name },
      permissions,
    };
  }

  /** Perfil del usuario autenticado (para GET /auth/me). */
  me(authUser: AuthUser): PublicUser {
    return {
      id: authUser.id,
      firstName: authUser.firstName,
      lastName: authUser.lastName,
      email: authUser.email,
      role: { key: authUser.roleKey, name: authUser.roleName },
      permissions: authUser.permissions,
    };
  }

  /**
   * Login (SDD §6, §10): mensaje genérico para credenciales inválidas
   * (no permite enumerar usuarios), usuarios inactivos no pueden entrar,
   * y todo intento queda auditado.
   */
  async login(input: LoginInput, context: SessionContext): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: { role: true },
    });

    const credentialsOk = user ? await argon2.verify(user.passwordHash, input.password) : false;

    if (!user || !credentialsOk) {
      await this.audit.log({
        userId: user?.id ?? null,
        action: 'LOGIN_FAILED',
        entityType: 'USER',
        entityId: user?.id ?? null,
        metadata: { reason: 'bad_credentials', email: input.email },
        ip: context.ip,
      });
      throw new UnauthorizedException({
        error: { code: 'INVALID_CREDENTIALS', message: GENERIC_LOGIN_ERROR },
      });
    }

    if (user.status !== 'ACTIVO') {
      await this.audit.log({
        userId: user.id,
        action: 'LOGIN_FAILED',
        entityType: 'USER',
        entityId: user.id,
        metadata: { reason: 'inactive', email: input.email },
        ip: context.ip,
      });
      throw new UnauthorizedException({
        error: {
          code: 'ACCOUNT_INACTIVE',
          message: 'Tu cuenta está inactiva. Contactá al administrador.',
        },
      });
    }

    const session = await this.sessions.create(user.id, context);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.log({
      userId: user.id,
      action: 'LOGIN',
      entityType: 'USER',
      entityId: user.id,
      metadata: { email: user.email },
      ip: context.ip,
    });

    return { user: this.toPublicUser(user), ...session };
  }

  /** Logout idempotente: revoca la sesión de la cookie y la borra. */
  async logout(
    token: string | undefined,
    authUser: AuthUser | undefined,
    context: SessionContext,
  ): Promise<void> {
    if (token) await this.sessions.revoke(token);
    if (authUser) {
      await this.audit.log({
        userId: authUser.id,
        action: 'LOGOUT',
        entityType: 'USER',
        entityId: authUser.id,
        metadata: { email: authUser.email },
        ip: context.ip,
      });
    }
  }

  /**
   * Registro por código de invitación (SDD §6, sin registro público):
   * el código aporta el rol, se consume de forma atómica y el usuario
   * queda creado con la contraseña hasheada (Argon2id).
   */
  async register(input: RegisterInput, context: SessionContext): Promise<AuthResult> {
    const invitation = await this.prisma.invitationCode.findUnique({
      where: { code: input.invitationCode },
      include: { role: true },
    });

    if (!invitation) {
      throw new BadRequestException({
        error: {
          code: 'INVITATION_INVALID',
          message: 'El código de invitación no es válido o ya fue utilizado.',
        },
      });
    }
    if (invitation.revokedAt !== null || invitation.status === 'REVOGADO') {
      throw new BadRequestException({
        error: { code: 'INVITATION_REVOKED', message: 'El código de invitación fue revocado.' },
      });
    }
    if (
      (invitation.expiresAt !== null && invitation.expiresAt.getTime() <= Date.now()) ||
      invitation.status === 'EXPIRADO'
    ) {
      throw new BadRequestException({
        error: { code: 'INVITATION_EXPIRED', message: 'El código de invitación ha expirado.' },
      });
    }
    if (invitation.status !== 'DISPONIBLE') {
      throw new BadRequestException({
        error: {
          code: 'INVITATION_INVALID',
          message: 'El código de invitación no es válido o ya fue utilizado.',
        },
      });
    }

    const [emailTaken, dniTaken] = await Promise.all([
      this.prisma.user.findUnique({ where: { email: input.email }, select: { id: true } }),
      this.prisma.user.findUnique({ where: { dni: input.dni }, select: { id: true } }),
    ]);
    if (emailTaken) {
      throw new BadRequestException({
        error: { code: 'EMAIL_TAKEN', message: 'Ya existe una cuenta con ese email.' },
      });
    }
    if (dniTaken) {
      throw new BadRequestException({
        error: { code: 'DNI_TAKEN', message: 'Ya existe una cuenta con ese DNI.' },
      });
    }

    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });

    let user: User;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: input.email,
            passwordHash,
            firstName: input.firstName,
            lastName: input.lastName,
            dni: input.dni,
            status: 'ACTIVO',
            roleId: invitation.roleId,
          },
        });
        // Consumo atómico: si otro request ya lo usó, la transacción revierte.
        const consumed = await tx.invitationCode.updateMany({
          where: { id: invitation.id, status: 'DISPONIBLE' },
          data: { status: 'UTILIZADO', usedAt: new Date(), usedById: created.id },
        });
        if (consumed.count !== 1) {
          throw new BadRequestException({
            error: {
              code: 'INVITATION_INVALID',
              message: 'El código de invitación no es válido o ya fue utilizado.',
            },
          });
        }
        return created;
      });
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException({
        error: {
          code: 'INVITATION_INVALID',
          message: 'El código de invitación no es válido o ya fue utilizado.',
        },
      });
    }

    const session = await this.sessions.create(user.id, context);
    await this.audit.log({
      userId: user.id,
      action: 'USER_CREATED',
      entityType: 'USER',
      entityId: user.id,
      metadata: { email: user.email, via: 'invitation_code', invitationCodeId: invitation.id },
      ip: context.ip,
    });

    const fullUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { role: true },
    });
    return { user: this.toPublicUser(fullUser), ...session };
  }

  /**
   * Solicitud de recuperación (ADR-005): siempre responde OK para no
   * revelar si el email existe; el token se guarda hasheado y el envío
   * queda detrás de MailProvider (stub en el MVP).
   */
  async forgotPassword(input: ForgotPasswordInput, context: SessionContext): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user || user.status !== 'ACTIVO') return;

    const token = randomBytes(32).toString('base64url');
    await this.prisma.$transaction([
      // Un solo token vigente por usuario.
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(
            Date.now() + Number(process.env.PASSWORD_RESET_TTL_MIN ?? 30) * 60_000,
          ),
        },
      }),
    ]);

    const webOrigin = primaryWebOrigin();
    await this.mail.send({
      to: user.email,
      subject: 'Restablecer tu contraseña',
      text: [
        'Recibimos una solicitud para restablecer tu contraseña.',
        `Ingresá en: ${webOrigin}/restablecer?token=${token}`,
        'Si no fuiste vos, ignorá este mensaje. El enlace vence en unos minutos.',
      ].join('\n'),
    });

    await this.audit.log({
      userId: user.id,
      action: 'PASSWORD_RESET_REQUESTED',
      entityType: 'USER',
      entityId: user.id,
      metadata: { email: user.email },
      ip: context.ip,
    });
  }

  /** Restablece la contraseña con token de un solo uso y cierra todas las sesiones. */
  async resetPassword(input: ResetPasswordInput, context: SessionContext): Promise<void> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(input.token) },
    });
    if (!record || record.usedAt !== null || record.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException({
        error: {
          code: 'RESET_TOKEN_INVALID',
          message: 'El enlace de restablecimiento no es válido o ya expiró. Solicitá uno nuevo.',
        },
      });
    }

    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    ]);
    await this.sessions.revokeAllForUser(record.userId);

    await this.audit.log({
      userId: record.userId,
      action: 'PASSWORD_RESET_COMPLETED',
      entityType: 'USER',
      entityId: record.userId,
      ip: context.ip,
    });
  }

  /** Cambio de contraseña con sesión activa: cierra las demás sesiones. */
  async changePassword(
    authUser: AuthUser,
    currentPassword: string,
    newPassword: string,
    context: SessionContext,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: authUser.id } });
    const ok = await argon2.verify(user.passwordHash, currentPassword);
    if (!ok) {
      throw new UnauthorizedException({
        error: { code: 'INVALID_CREDENTIALS', message: 'La contraseña actual es incorrecta.' },
      });
    }

    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    await this.sessions.revokeAllForUser(user.id, authUser.sessionId);

    await this.audit.log({
      userId: user.id,
      action: 'PASSWORD_CHANGED',
      entityType: 'USER',
      entityId: user.id,
      ip: context.ip,
    });
    this.logger.log(`Contraseña cambiada para usuario ${user.id}`);
  }
}
