import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { chromium, type Browser, type LaunchOptions, type Page } from 'playwright';
import { AuditService } from '../audit/audit.service';
import type { Patient } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildOdontogramHtml } from './odontogram-pdf.template';

/** Ejecutor de la exportación (para auditoría). */
export interface OdontogramPdfActor {
  id: string;
  firstName: string;
  lastName: string;
  ip?: string;
}

export interface OdontogramPdfResult {
  buffer: Buffer;
  filename: string;
}

/**
 * Variantes de lanzamiento en orden: primero el Chromium de Playwright (si se
 * instaló con `playwright install chromium`), luego el navegador del sistema.
 * Así el PDF funciona en CI y en máquinas sin descargas (ADR-004).
 */
const LAUNCH_VARIANTS: LaunchOptions[] = [
  { headless: true },
  { headless: true, channel: 'chrome' },
  { headless: true, channel: 'msedge' },
];

function pdfUnavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    error: {
      code: 'PDF_UNAVAILABLE',
      message: 'No fue posible generar el PDF en este momento. Intentá nuevamente más tarde.',
    },
  });
}

/** Nombre de archivo ASCII seguro: odontograma-apellido-dni.pdf */
function pdfFilename(patient: Pick<Patient, 'lastName' | 'dni'>): string {
  const slug = patient.lastName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const dni = patient.dni.replace(/[^0-9A-Za-z]/g, '') || 'sin-dni';
  return `odontograma-${slug || 'paciente'}-${dni}.pdf`;
}

/**
 * Exportación del odontograma a PDF (SDD CU-11 / ADR-004 / fase 10): el
 * backend arma el HTML (encabezado, FDI, estados, leyenda) y lo convierte en
 * PDF con Playwright, igual para web y escritorio. El navegador se mantiene
 * abierto en un singleton y se cierra con el módulo; si falta ningún
 * navegador responde 503 PDF_UNAVAILABLE (nunca un 500 con stack).
 */
@Injectable()
export class OdontogramPdfService implements OnModuleDestroy {
  private readonly logger = new Logger(OdontogramPdfService.name);
  private browserPromise: Promise<Browser> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** PDF del odontograma (CU-11): valida paciente, renderiza y audita. */
  async exportPdf(patientId: string, actor: OdontogramPdfActor): Promise<OdontogramPdfResult> {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) {
      throw new NotFoundException({
        error: {
          code: 'PATIENT_NOT_FOUND',
          message: 'No existe un paciente con ese identificador.',
        },
      });
    }

    const teeth = await this.prisma.tooth.findMany({
      where: { patientId },
      orderBy: { fdiNumber: 'asc' },
    });

    const html = buildOdontogramHtml({
      patient,
      teeth,
      exportedAt: new Date(),
      exportedBy: `${actor.lastName}, ${actor.firstName}`,
    });
    const buffer = await this.renderPdf(html);

    // Exportar información clínica es un acceso sensible: queda auditado
    // contra el paciente (visible en la pestaña Historial de la ficha).
    await this.audit.log({
      userId: actor.id,
      action: 'ODONTOGRAM_PDF_EXPORTED',
      entityType: 'PATIENT',
      entityId: patientId,
      metadata: { patientId, dni: patient.dni },
      ip: actor.ip,
    });

    return { buffer, filename: pdfFilename(patient) };
  }

  private async renderPdf(html: string): Promise<Buffer> {
    const browser = await this.getBrowser();
    let page: Page | undefined;
    try {
      page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      const pdf = await page.pdf({
        format: 'A4',
        landscape: true,
        printBackground: true,
        margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
      });
      return Buffer.from(pdf);
    } catch (error) {
      // Posible crash del navegador: se descarta para re-lanzar el próximo.
      this.browserPromise = null;
      this.logger.warn(`Fallo al renderizar el PDF del odontograma: ${String(error)}`);
      throw pdfUnavailable();
    } finally {
      if (page) {
        await page.close().catch(() => undefined);
      }
    }
  }

  /** Singleton perezoso; si el lanzamiento falla no deja promesa cacheada. */
  private getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      const promise = this.launchBrowser();
      this.browserPromise = promise;
      promise.catch(() => {
        if (this.browserPromise === promise) {
          this.browserPromise = null;
        }
      });
    }
    return this.browserPromise;
  }

  private async launchBrowser(): Promise<Browser> {
    let lastError: unknown;
    for (const variant of LAUNCH_VARIANTS) {
      try {
        return await chromium.launch(variant);
      } catch (error) {
        lastError = error;
      }
    }
    this.logger.error(`No hay navegador disponible para exportar PDF: ${String(lastError)}`);
    throw pdfUnavailable();
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.browserPromise) return;
    try {
      const browser = await this.browserPromise;
      await browser.close();
    } catch {
      // El navegador nunca llegó a lanzarse o ya estaba cerrado.
    }
    this.browserPromise = null;
  }
}
