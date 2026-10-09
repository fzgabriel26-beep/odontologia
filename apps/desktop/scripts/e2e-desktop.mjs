/**
 * E2E de la app de escritorio (fase 11, ADR-015).
 *
 * Valora el build release real (WebView2 vía CDP):
 *   bundle estático → login (cookie SameSite=None; Secure) → sesión activa →
 *   listado → ficha por query param → logout → consola sin errores.
 *
 * Requisitos:
 *   - API dev corriendo en http://localhost:3001 (o variable API_URL)
 *   - `pnpm --filter @odonto/desktop tauri:build` previo (genera el .exe)
 *   - WebView2 runtime (incluido en Windows 10/11 actualizado)
 *
 * Uso: pnpm --filter @odonto/desktop e2e
 *
 * El script es idempotente: limpia cookies de la webview al iniciar (el
 * perfil de WebView2 persiste sesiones reales) y deja el perfil deslogueado.
 * Crea un paciente de prueba con DNI único y lo archiva al finalizar.
 */
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const API = process.env.API_URL ?? 'http://localhost:3001/api/v1';
const API_ORIGIN = 'http://localhost:3000'; // origen web primario (CSRF)
const WEB = 'http://tauri.localhost';
const CDP = 'http://127.0.0.1:9223';
const EMAIL = process.env.E2E_EMAIL ?? 'admin@consultorio.local';
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin1234!';
const EXE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src-tauri',
  'target',
  'release',
  'odontologia-desktop.exe',
);

function log(step, message) {
  process.stdout.write(`${step}) ${message}\n`);
}

function apiHeaders(cookie) {
  return {
    'Content-Type': 'application/json',
    Origin: API_ORIGIN,
    ...(cookie ? { Cookie: cookie } : {}),
  };
}

async function apiLogin() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(`login API: HTTP ${res.status} ${await res.text()}`);
  }
  const cookie = (res.headers.getSetCookie() ?? []).map((c) => c.split(';')[0]).join('; ');
  const body = await res.json();
  return { cookie, user: body.user };
}

async function createPatient(cookie) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const dni = String(90000000 + Math.floor(Math.random() * 10000000));
    const res = await fetch(`${API}/patients`, {
      method: 'POST',
      headers: apiHeaders(cookie),
      body: JSON.stringify({ firstName: 'E2E', lastName: 'Escritorio', dni }),
    });
    if (res.ok) {
      const body = await res.json();
      return { id: body.id, dni };
    }
    const text = await res.text();
    if (!text.includes('UNIQUE') && !text.includes('unique')) {
      throw new Error(`alta de paciente: HTTP ${res.status} ${text}`);
    }
  }
  throw new Error('no se pudo crear el paciente de prueba (DNI duplicado x3)');
}

async function archivePatient(cookie, id) {
  const res = await fetch(`${API}/patients/${id}/archive`, {
    method: 'POST',
    headers: apiHeaders(cookie),
  });
  return res.ok;
}

function killExistingApp() {
  try {
    execSync('taskkill /IM odontologia-desktop.exe /F', { stdio: 'ignore' });
  } catch {
    // no había instancia previa
  }
}

async function connectWithRetry() {
  let lastError;
  for (let i = 0; i < 30; i++) {
    try {
      return await chromium.connectOverCDP(CDP);
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw lastError;
}

async function runUiFlow(browser) {
  const ctx = browser.contexts()[0];
  // El perfil de WebView2 persiste entre corridas: se limpian las cookies
  // para que el flujo de login siempre se ejecute desde cero.
  await ctx.clearCookies();
  const page = ctx.pages()[0] ?? (await ctx.newPage());

  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') {
      const { url } = m.location();
      consoleErrors.push(`${m.text()}${url ? ` @ ${url}` : ''}`);
    }
  });

  // La navegación puede abortar en WebView2 (frame detached): se tolera,
  // la página queda viva.
  await page
    .goto(`${WEB}/`, { waitUntil: 'domcontentloaded' })
    .catch((e) => process.stdout.write(`(goto: ${e.message.split('\n')[0]})\n`));
  await page.waitForSelector('a[href^="/login"], input[type="email"]', {
    timeout: 20000,
  });
  log(1, `bundle cargado. url=${page.url()}`);

  const loginLink = page.locator('a[href^="/login"]');
  if ((await loginLink.count()) > 0) {
    await loginLink.first().click();
  }
  await page.waitForSelector('input[type="email"]', { timeout: 20000 });
  log(1, `login visible. url=${page.url()}`);

  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 20000 });
  log(2, `login OK -> ${page.url()}`);

  // La sesión vive en la cookie httpOnly (None; Secure): si llegó al
  // dashboard, la webview la envió y el backend la aceptó.
  await page.waitForSelector('a[href="/pacientes/"], a[href="/pacientes"]', {
    timeout: 20000,
  });
  log(3, 'sidebar logueado visible');

  await page.click('a[href="/pacientes/"], a[href="/pacientes"]');
  await page.waitForSelector('a:has-text("Ver ficha")', { timeout: 20000 });
  log(4, 'listado de pacientes OK');

  await page.click('a:has-text("Ver ficha")');
  await page.waitForURL(/\/pacientes\/ficha\/?\?id=/, { timeout: 20000 });
  await page.waitForSelector('[role="tab"]:has-text("Odontograma")', {
    timeout: 20000,
  });
  log(5, `ficha por query param OK -> ${page.url()}`);

  // Cierre: logout desde la UI → valida que la sesión de escritorio se
  // destruye y deja el perfil limpio para la próxima corrida.
  await page.click('button:has-text("Cerrar sesión")');
  await page.waitForSelector('input[type="email"]', { timeout: 20000 });
  log(6, `logout OK -> ${page.url()}`);

  const realErrors = consoleErrors.filter(
    (e) =>
      !e.includes('favicon') &&
      !e.includes('404 (Not Found)') &&
      // Sonda de sesión por diseño: /auth/me responde 401 sin sesión
      // (carga inicial y posterior al logout).
      !(e.includes('401 (Unauthorized)') && e.includes('/auth/me')),
  );
  if (realErrors.length) {
    process.stderr.write(`ERRORES DE CONSOLA:\n${realErrors.join('\n')}\n`);
    return false;
  }
  log(7, 'sin errores de consola (CSP/CORS limpios)');
  return true;
}

async function main() {
  // 1. API arriba.
  try {
    const res = await fetch(`${API}/auth/me`);
    if (res.status !== 401 && res.status !== 200) {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (e) {
    throw new Error(
      `API no responde en ${API} (${e.message}). ` +
        'Levantala con: pnpm --filter "@odonto/api" dev',
    );
  }

  // 2. .exe compilado.
  if (!fs.existsSync(EXE)) {
    throw new Error(`No existe ${EXE}. Compilá antes: pnpm --filter "@odonto/desktop" tauri:build`);
  }

  // 3. Paciente de prueba activo (la lista filtra ACTIVO por defecto).
  const { cookie } = await apiLogin();
  const patient = await createPatient(cookie);
  log(0, `paciente de prueba dni=${patient.dni}`);

  // 4. Lanzar la app con CDP.
  killExistingApp();
  const app = spawn(EXE, [], {
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9223',
    },
    stdio: 'ignore',
  });

  let exitCode = 1;
  let browser;
  try {
    await new Promise((r) => setTimeout(r, 3000));
    browser = await connectWithRetry();
    const ok = await runUiFlow(browser);
    exitCode = ok ? 0 : 1;
    log(8, ok ? 'E2E ESCRITORIO: OK' : 'E2E ESCRITORIO: FALLO');
  } finally {
    if (browser) await browser.close().catch(() => {});
    try {
      execSync(`taskkill /PID ${app.pid} /T /F`, { stdio: 'ignore' });
    } catch {
      // ya cerrado
    }
    const archived = await archivePatient(cookie, patient.id).catch(() => false);
    log(8, `limpieza: paciente archivado=${archived}`);
  }
  return exitCode;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(`E2E FALLO: ${e.message}\n`);
    process.exit(1);
  });
