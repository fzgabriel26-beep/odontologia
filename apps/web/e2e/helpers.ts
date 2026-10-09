import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Download, type Locator, type Page } from '@playwright/test';

/**
 * Infraestructura compartida de los E2E del web (fase 12, SDD §13).
 *
 * Dos temas centrales:
 *
 * 1. Rate limit de autenticación: `/auth/login`, `/auth/me` y compañía tienen
 *    10 requests por 60 s por IP (`@AuthRateLimit`, throttler por handler).
 *    Cada pantalla autenticada dispara `/auth/me` (x2: Next.js en dev con
 *    StrictMode duplica el efecto) y un login completo suma el POST de
 *    `/auth/login`. Si se pasa del límite, `fetchMe()` recibe 429, devuelve
 *    null y la app redirige al login. `gotoApp()`/`reloadApp()` dosifican eso
 *    con un archivo compartido (`.auth/page-pace.json`), ventana móvil de
 *    61 s y presupuesto 8 (< 10, con margen).
 *
 * 2. API desde los specs: se usa `page.request`, que comparte el cookie jar
 *    del contexto del navegador (misma sesión, sin gastar el presupuesto de
 *    `/auth/login`) y no envía cabecera `Origin` (o la enviamos propia), por
 *    lo que el guard CSRF la acepta. Las URLs son absolutas porque los
 *    fixtures de requests de Playwright no heredan el `baseURL` del config.
 */

/** Origen web: primer valor de `WEB_ORIGIN` permitido por el guard CSRF. */
export const WEB_ORIGIN = process.env.E2E_WEB_URL ?? 'http://localhost:3000';

/** API absoluta (`http://host:3001/api/v1`). */
export const API_URL = `${process.env.E2E_API_URL ?? 'http://localhost:3001'}/api/v1`;

/** Seed de la fase 1: único usuario administrador del SDD. */
export const ADMIN_EMAIL = process.env.E2E_EMAIL ?? 'admin@consultorio.local';
export const ADMIN_PASSWORD = process.env.E2E_PASSWORD ?? 'Admin1234!';

/** Estado de sesión que escribe el setup y reutiliza el proyecto chromium. */
export const STORAGE_STATE = path.resolve(__dirname, '..', '.auth', 'admin.json');

/** PNG mínimo (68 bytes) con firma válida: sirve para subir un estudio. */
export const PNG_FIXTURE = path.resolve(__dirname, 'fixtures', 'estudio-e2e.png');

/* ------------------------------------------------------------------ */
/* Presupuesto de rate limit de /auth/*                                */
/* ------------------------------------------------------------------ */

const PACE_FILE = path.resolve(__dirname, '..', '.auth', 'page-pace.json');
/** Ventana móvil apenas mayor que la del Throttler (60 s). */
const PACE_WINDOW_MS = 61_000;
/** 8 < 10: margen para requests que no compute (p. ej. preflights). */
const PACE_BUDGET = 8;

/**
 * Requests que dispara montar una pantalla autenticada: el proveedor de
 * sesión llama a `/auth/me` y el StrictMode de Next.js en dev duplica el
 * efecto (dos requests por montaje).
 */
export const MOUNT_COST = 2;
/** Login completo: `/auth/me` del login (2) + POST (1) + `/auth/me` del dashboard (2). */
export const LOGIN_COST = 5;
/** Login con credenciales inválidas: `/auth/me` del login (2) + POST fallido (1). */
export const FAILED_LOGIN_COST = 3;
/** Ruta protegida sin sesión: `/auth/me` de la ruta (2) + los del login al redirigir (2). */
export const UNAUTHENTICATED_COST = 4;

function readPace(): number[] {
  try {
    const parsed = JSON.parse(readFileSync(PACE_FILE, 'utf8')) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((stamp): stamp is number => typeof stamp === 'number');
  } catch {
    return [];
  }
}

/**
 * Descuenta `cost` unidades del presupuesto de `/auth/*` y espera si la
 * ventana móvil quedó llena. El archivo es compartido entre specs porque
 * Playwright corre secuencial (workers: 1) en un solo proceso.
 */
async function pace(cost: number): Promise<void> {
  // Una espera de rate limit + el primer compile de Next superan 60 s.
  test.setTimeout(240_000);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const now = Date.now();
    const recent = readPace().filter((stamp) => now - stamp < PACE_WINDOW_MS);
    if (recent.length + cost <= PACE_BUDGET) {
      const stamps = [...recent];
      for (let index = 0; index < cost; index += 1) {
        stamps.push(Date.now());
      }
      mkdirSync(path.dirname(PACE_FILE), { recursive: true });
      writeFileSync(PACE_FILE, JSON.stringify(stamps));
      return;
    }
    // La ventana se llena: esperamos a que "expire" el request más viejo.
    const oldest = recent.reduce((min, stamp) => (stamp < min ? stamp : min), now);
    const waitMs = oldest + PACE_WINDOW_MS - now + 500;
    if (waitMs > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, waitMs);
      });
    }
  }
}

/** Navega a una ruta del web descontando su costo de `/auth/*`. */
export async function gotoApp(page: Page, url: string, cost = MOUNT_COST): Promise<void> {
  await pace(cost);
  await page.goto(url);
}

/** Recarga una ruta del web (vuelve a disparar `/auth/me` en el cliente). */
export async function reloadApp(page: Page, cost = MOUNT_COST): Promise<void> {
  await pace(cost);
  await page.reload();
}

/** Login por UI desde el formulario (una sola vez por corrida: el setup). */
export async function loginViaUi(page: Page): Promise<void> {
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Contraseña').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL(/\/dashboard/);
}

/* ------------------------------------------------------------------ */
/* API (misma sesión que el navegador, sin gastar /auth/login)         */
/* ------------------------------------------------------------------ */

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface ApiOptions {
  method?: HttpMethod;
  data?: unknown;
  headers?: Record<string, string>;
}

export interface ApiResult<T> {
  status: number;
  ok: boolean;
  text: string;
  body: T;
}

export async function apiRequest<T>(
  page: Page,
  requestPath: string,
  options: ApiOptions = {},
): Promise<ApiResult<T>> {
  const { method = 'GET', data, headers } = options;
  const url = `${API_URL}${requestPath}`;
  const requestOptions: { data?: unknown; headers?: Record<string, string> } = {};
  if (headers !== undefined) requestOptions.headers = headers;
  if (data !== undefined && method !== 'GET') requestOptions.data = data;

  const response =
    method === 'GET'
      ? await page.request.get(url, requestOptions)
      : method === 'POST'
        ? await page.request.post(url, requestOptions)
        : method === 'PATCH'
          ? await page.request.patch(url, requestOptions)
          : await page.request.delete(url, requestOptions);

  const text = await response.text();
  let body: T | undefined;
  try {
    body = JSON.parse(text) as T;
  } catch {
    body = undefined;
  }
  return { status: response.status(), ok: response.ok(), text, body: body as T };
}

/** Error legible cuando la API no responde lo esperado. */
export function apiError(label: string, result: ApiResult<unknown>): Error {
  return new Error(`${label} → HTTP ${result.status}: ${result.text.slice(0, 300)}`);
}

export interface PatientRecord {
  id: string;
  firstName: string;
  lastName: string;
  dni: string;
}

/** DNI único de 8 dígitos: los tests jamás reutilizan uno existente. */
export function uniqueDni(): string {
  return String(90_000_000 + Math.floor(Math.random() * 10_000_000));
}

export interface CreatePatientOptions {
  firstName?: string;
  lastName?: string;
  /** DNI fijo (para el caso de duplicados); si falta, se genera uno único. */
  dni?: string;
  /** Headers extra (p. ej. `Origin` para el control del guard CSRF). */
  headers?: Record<string, string>;
}

/** Alta de paciente por API (reintenta si el DNI aleatorio ya existe). */
export async function createPatientViaApi(
  page: Page,
  options: CreatePatientOptions = {},
): Promise<PatientRecord> {
  const attempts = options.dni === undefined ? 3 : 1;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const dni = options.dni ?? uniqueDni();
    const result = await apiRequest<PatientRecord>(page, '/patients', {
      method: 'POST',
      headers: options.headers,
      data: {
        firstName: options.firstName ?? 'E2E',
        lastName: options.lastName ?? 'Paciente',
        dni,
      },
    });
    if (result.ok) return result.body;
    if (result.status === 409 && attempt < attempts) continue;
    throw apiError('POST /patients', result);
  }
  throw new Error('POST /patients: no fue posible generar un DNI único.');
}

/** Archivado lógico de la ficha: nunca se borra físicamente (409 si ya está). */
export async function archivePatientViaApi(page: Page, patientId: string): Promise<void> {
  const result = await apiRequest<unknown>(page, `/patients/${patientId}/archive`, {
    method: 'POST',
  });
  if (!result.ok && result.status !== 409) {
    throw apiError('POST /patients/:id/archive', result);
  }
}

export interface ProfessionalRecord {
  id: string;
  firstName: string;
  lastName: string;
  roleKey: string;
}

export async function listProfessionalsViaApi(page: Page): Promise<ProfessionalRecord[]> {
  const result = await apiRequest<ProfessionalRecord[]>(page, '/appointments/professionals');
  if (!result.ok) throw apiError('GET /appointments/professionals', result);
  return result.body;
}

export interface AppointmentRecord {
  id: string;
  date: string;
  time: string;
  status: string;
}

export interface CreateAppointmentOptions {
  patientId: string;
  professionalId: string;
  /** Por defecto, hoy en la zona de la app. */
  date?: string;
  time?: string;
  durationMin?: number;
  reason?: string;
}

export async function createAppointmentViaApi(
  page: Page,
  options: CreateAppointmentOptions,
): Promise<AppointmentRecord> {
  const result = await apiRequest<AppointmentRecord>(page, '/appointments', {
    method: 'POST',
    data: {
      patientId: options.patientId,
      professionalId: options.professionalId,
      date: options.date ?? todayIso(),
      time: options.time ?? '16:30',
      durationMin: options.durationMin ?? 30,
      reason: options.reason ?? 'Consulta E2E',
    },
  });
  if (!result.ok) throw apiError('POST /appointments', result);
  return result.body;
}

/** Cambio de estado por API (la agenda lo refleja tras recargar). */
export async function changeAppointmentStatusViaApi(
  page: Page,
  appointmentId: string,
  status: 'PENDIENTE' | 'CONFIRMADO' | 'CANCELADO' | 'AUSENTE' | 'REPROGRAMADO' | 'ATENDIDO',
  reason?: string,
): Promise<void> {
  const result = await apiRequest<unknown>(page, `/appointments/${appointmentId}/status`, {
    method: 'POST',
    data: { status, ...(reason === undefined ? {} : { reason }) },
  });
  if (!result.ok) throw apiError('POST /appointments/:id/status', result);
}

/** Fecha `aaaa-mm-dd` de hoy en la zona de la app (la agenda usa el navegador). */
export function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/* ------------------------------------------------------------------ */
/* Localizadores y aserciones reutilizables                            */
/* ------------------------------------------------------------------ */

/** Aviso de éxito/error: todos los avisos de la app son `role="alert"`. */
export async function expectNotice(page: Page, text: string): Promise<void> {
  await expect(page.getByRole('alert').filter({ hasText: text })).toBeVisible();
}

/** Fila de la agenda de un paciente concreto (se identifica por su DNI). */
export function appointmentEntry(page: Page, dni: string): Locator {
  return page.locator('div.space-y-3.rounded-lg').filter({ hasText: `DNI ${dni}` });
}

/** Contenedor del estudio subido en la pestaña "Estudios y archivos". */
export function fileEntry(page: Page, fileName: string): Locator {
  return page.locator('div.justify-between.rounded-lg.border').filter({ hasText: fileName });
}

/** Lee los bytes de una descarga (Playwright la volcó a disco). */
export async function readDownload(download: Download): Promise<Buffer> {
  const filePath = await download.path();
  if (filePath === null) throw new Error('La descarga no generó un archivo temporal.');
  return readFile(filePath);
}
