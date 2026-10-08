import type { SessionUser } from '@odonto/types';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

/** Error normalizado de la API: código, mensaje en español y errores por campo. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string> | undefined;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    fields?: Record<string, string>;
  };
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** JSON serializado, o FormData para subida multipart (el boundary lo pone el navegador). */
  body?: unknown;
}

/**
 * Cliente HTTP de la API. Usa `credentials: 'include'` para que la cookie
 * httpOnly de sesión viaje siempre; las respuestas de error se normalizan
 * a ApiError (sin exponer detalles técnicos al usuario).
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body } = options;

  let response: Response;
  try {
    const isFormData = body instanceof FormData;
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers:
        body !== undefined && !isFormData ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? (isFormData ? body : JSON.stringify(body)) : undefined,
      credentials: 'include',
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'No se pudo conectar con el servidor. Intentá nuevamente.',
    );
  }

  const data = (await response.json().catch(() => null)) as T | ApiErrorBody | null;

  if (!response.ok) {
    const errorBody = (data ?? {}) as ApiErrorBody;
    throw new ApiError(
      response.status,
      errorBody.error?.code ?? 'HTTP_ERROR',
      errorBody.error?.message ?? 'No fue posible procesar la solicitud.',
      errorBody.error?.fields,
    );
  }

  return data as T;
}

/** Devuelve el usuario de la sesión actual o null si no hay sesión válida. */
export async function fetchMe(): Promise<SessionUser | null> {
  try {
    const response = await apiFetch<{ user: SessionUser }>('/auth/me');
    return response.user;
  } catch {
    return null;
  }
}

export interface DownloadedFile {
  blob: Blob;
  /** Nombre sugerido desde Content-Disposition, o null si no viene expuesto. */
  filename: string | null;
}

function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  return /filename="([^"]+)"/.exec(header)?.[1] ?? null;
}

/**
 * Descarga binaria autenticada (PDF del odontograma, etc.): igual que
 * apiFetch pero devuelve el blob, y los errores JSON se normalizan a ApiError
 * en lugar de abrir una pestaña con la respuesta cruda.
 */
export async function apiDownload(path: string): Promise<DownloadedFile> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { credentials: 'include' });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'No se pudo conectar con el servidor. Intentá nuevamente.',
    );
  }

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(
      response.status,
      data?.error?.code ?? 'HTTP_ERROR',
      data?.error?.message ?? 'No fue posible procesar la solicitud.',
      data?.error?.fields,
    );
  }

  return {
    blob: await response.blob(),
    filename: filenameFromDisposition(response.headers.get('Content-Disposition')),
  };
}
