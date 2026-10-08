import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/** Usuario autenticado que adjunta el SessionGuard a la request. */
export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roleKey: string;
  roleName: string;
  permissions: string[];
  sessionId: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!request.user) {
      throw new Error('CurrentUser solicitado sin SessionGuard (falta autenticación).');
    }
    return request.user;
  },
);
