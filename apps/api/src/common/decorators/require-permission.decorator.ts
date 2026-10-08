import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Exige los permisos indicados además de sesión vigente (SDD §10: RBAC
 * verificado en backend en cada endpoint). Se puede aplicar en la clase
 * o en el método; se combina con el SessionGuard global.
 */
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
