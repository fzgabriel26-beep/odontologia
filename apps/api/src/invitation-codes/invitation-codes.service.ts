import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CreateInvitationCodeInput } from '@odonto/validation';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin caracteres ambiguos (I, O, 0, 1)

export interface InvitationCodeView {
  id: string;
  code: string;
  role: { key: string; name: string };
  /** Estado persistido. */
  status: 'DISPONIBLE' | 'UTILIZADO' | 'EXPIRADO' | 'REVOGADO';
  /** Estado para mostrar: DISPONIBLE + vencido → EXPIRADO. */
  displayStatus: 'DISPONIBLE' | 'UTILIZADO' | 'EXPIRADO' | 'REVOGADO';
  expiresAt: Date | null;
  revokedAt: Date | null;
  usedAt: Date | null;
  createdBy: { firstName: string; lastName: string } | null;
  usedBy: { firstName: string; lastName: string } | null;
  createdAt: Date;
}

@Injectable()
export class InvitationCodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Código con formato ODONTO-XXXX-XXXX (letras/números sin ambiguos). */
  private generateCodeValue(): string {
    const block = (): string => {
      const bytes = randomBytes(4);
      let result = '';
      for (const byte of bytes) {
        result += ALPHABET[byte % ALPHABET.length];
      }
      return result;
    };
    return `ODONTO-${block()}-${block()}`;
  }

  private toView(code: {
    id: string;
    code: string;
    status: string;
    expiresAt: Date | null;
    revokedAt: Date | null;
    usedAt: Date | null;
    createdAt: Date;
    role: { key: string; name: string };
    createdBy: { firstName: string; lastName: string } | null;
    usedBy: { firstName: string; lastName: string } | null;
  }): InvitationCodeView {
    const status = code.status as InvitationCodeView['status'];
    const expired =
      status === 'DISPONIBLE' && code.expiresAt !== null && code.expiresAt <= new Date();
    return {
      id: code.id,
      code: code.code,
      role: code.role,
      status,
      displayStatus: expired ? 'EXPIRADO' : status,
      expiresAt: code.expiresAt,
      revokedAt: code.revokedAt,
      usedAt: code.usedAt,
      createdBy: code.createdBy,
      usedBy: code.usedBy,
      createdAt: code.createdAt,
    };
  }

  async list(): Promise<InvitationCodeView[]> {
    const codes = await this.prisma.invitationCode.findMany({
      include: {
        role: true,
        createdBy: { select: { firstName: true, lastName: true } },
        usedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return codes.map((code) => this.toView(code));
  }

  /** Genera un código con rol (ADR-013) y expiración opcional. */
  async create(
    input: CreateInvitationCodeInput,
    actor: { id: string; ip?: string },
  ): Promise<InvitationCodeView> {
    const role = await this.prisma.role.findUnique({ where: { key: input.roleKey } });
    if (!role) {
      throw new BadRequestException({
        error: { code: 'ROLE_NOT_FOUND', message: 'El rol indicado no existe.' },
      });
    }

    const expiresAt =
      input.expiresInDays != null
        ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60_000)
        : null;

    let created: InvitationCodeView | null = null;
    let lastError: unknown = null;

    // Reintenta ante la (improbable) colisión del código único.
    for (let attempt = 0; attempt < 5 && created === null; attempt++) {
      try {
        const row = await this.prisma.invitationCode.create({
          data: {
            code: this.generateCodeValue(),
            roleId: role.id,
            createdById: actor.id,
            expiresAt,
          },
          include: {
            role: true,
            createdBy: { select: { firstName: true, lastName: true } },
            usedBy: { select: { firstName: true, lastName: true } },
          },
        });
        created = this.toView(row);
      } catch (error) {
        lastError = error;
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          (error as { code?: string }).code === 'P2002'
        ) {
          continue;
        }
        throw error;
      }
    }

    if (!created) {
      throw lastError instanceof Error ? lastError : new Error('No se pudo generar el código.');
    }

    await this.audit.log({
      userId: actor.id,
      action: 'INVITATION_CODE_CREATED',
      entityType: 'INVITATION_CODE',
      entityId: created.id,
      metadata: {
        code: created.code,
        roleKey: input.roleKey,
        expiresInDays: input.expiresInDays ?? null,
      },
      ip: actor.ip,
    });
    return created;
  }

  /** Revoca un código disponible (SDD CU-04). */
  async revoke(id: string, actor: { id: string; ip?: string }): Promise<InvitationCodeView> {
    const existing = await this.prisma.invitationCode.findUnique({
      where: { id },
      include: {
        role: true,
        createdBy: { select: { firstName: true, lastName: true } },
        usedBy: { select: { firstName: true, lastName: true } },
      },
    });
    if (!existing) {
      throw new NotFoundException({
        error: { code: 'CODE_NOT_FOUND', message: 'No existe un código con ese identificador.' },
      });
    }
    if (existing.status !== 'DISPONIBLE') {
      throw new ConflictException({
        error: { code: 'CODE_NOT_AVAILABLE', message: 'El código ya no está disponible.' },
      });
    }

    const revoked = await this.prisma.invitationCode.update({
      where: { id },
      data: { status: 'REVOGADO', revokedAt: new Date() },
      include: {
        role: true,
        createdBy: { select: { firstName: true, lastName: true } },
        usedBy: { select: { firstName: true, lastName: true } },
      },
    });

    await this.audit.log({
      userId: actor.id,
      action: 'INVITATION_CODE_REVOKED',
      entityType: 'INVITATION_CODE',
      entityId: id,
      metadata: { code: revoked.code },
      ip: actor.ip,
    });
    return this.toView(revoked);
  }
}
