import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marca un endpoint como accesible sin sesión. Toda autorización sigue en el backend. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
