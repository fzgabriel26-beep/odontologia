/**
 * `beforeDevCommand` de Tauri (fase 11):
 *
 * - Si apps/web ya corre en :3000 (p. ej. `pnpm dev` en la raíz del
 *   monorepo), se reutiliza ese servidor y este proceso queda vivo para no
 *   abortar `tauri dev`.
 * - Si nadie escucha en :3000, se levanta `pnpm --filter @odonto/web dev`.
 */
import { createConnection } from 'node:net';
import { spawn } from 'node:child_process';

const PORT = 3000;

function isPortOpen() {
  return new Promise((resolve) => {
    const socket = createConnection({ port: PORT, host: '127.0.0.1' });
    const done = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.setTimeout(1500, () => done(false));
  });
}

const alreadyRunning = await isPortOpen();

if (alreadyRunning) {
  process.stdout.write('[desktop] apps/web ya corre en :3000; se reutiliza ese servidor.\n');
  // Permanece vivo: mientras `beforeDevCommand` esté corriendo, tauri dev
  // mantiene la sesión; al salir (Ctrl+C), tauri lo termina junto con él.
  setInterval(() => {}, 1 << 30);
} else {
  process.stdout.write('[desktop] levantando apps/web (dev) en :3000 ...\n');
  const child = spawn('pnpm', ['--filter', '@odonto/web', 'dev'], {
    stdio: 'inherit',
    shell: true,
  });
  child.on('exit', (code) => {
    // Si el web muere, tauri dev debe terminar también.
    process.exit(code ?? 0);
  });
}
