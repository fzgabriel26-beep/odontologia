import {
  PERMANENT_TEETH_FDI,
  TEMPORARY_TEETH_FDI,
  TOOTH_STATUSES,
  TOOTH_STATUS_LABELS,
} from '@odonto/types';
import { buildOdontogramHtml, escapeHtml } from './odontogram-pdf.template';

/**
 * Tests unitarios del template HTML del PDF (fase 10 / CU-11): encabezado,
 * datos del paciente escapados, los 52 FDI, estados, leyenda completa y
 * ausencia de scripts/atributos peligrosos.
 */

describe('Template del PDF del odontograma', () => {
  const patient = {
    firstName: 'María <Test>',
    lastName: 'Pérez & Hnos',
    dni: '30111222',
    birthDate: new Date('1992-05-12T00:00:00.000Z'),
  };
  const teeth = [
    { fdiNumber: 16, currentStatus: 'CARIES' as string | null },
    { fdiNumber: 26, currentStatus: 'ENDODONCIA' as string | null },
    { fdiNumber: 46, currentStatus: null },
  ];
  const html = buildOdontogramHtml({
    patient,
    teeth,
    exportedAt: new Date('2026-10-08T15:30:00'),
    exportedBy: 'Admin, Seed',
  });

  it('incluye encabezado, datos del paciente y exportación', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('Sistema de Gestión Odontológica');
    expect(html).toContain('Odontograma FDI');
    expect(html).toContain('Fecha de exportación:');
    expect(html).toContain('Exportado por: Admin, Seed');
    expect(html).toContain('30111222');
    expect(html).toContain('12/05/1992');
    expect(html).toMatch(/\d+ años/);
  });

  it('escapa HTML en todos los datos del paciente', () => {
    expect(html).toContain('Pérez &amp; Hnos, María &lt;Test&gt;');
    expect(html).not.toContain('Pérez & Hnos');
    expect(html).not.toContain('<Test>');
    expect(html).not.toContain('<script>');
    expect(escapeHtml('<b>"x"\'</b>')).toBe('&lt;b&gt;&quot;x&quot;&#39;&lt;/b&gt;');
  });

  it('dibuja los 52 dientes FDI en el SVG', () => {
    const allFdi = [...PERMANENT_TEETH_FDI, ...TEMPORARY_TEETH_FDI];
    expect(allFdi).toHaveLength(52);
    for (const fdi of allFdi) {
      expect(html).toContain(`>${fdi}</text>`);
    }
    expect(html).toContain('Dentición permanente');
    expect(html).toContain('Dentición temporal');
  });

  it('lista los estados por diente con texto (además del color)', () => {
    expect(html).toContain('Estados por diente');
    expect(html).toContain('Dentición permanente');
    expect(html).toContain('Dentición temporal');
    expect(html).toContain('Superior');
    expect(html).toContain('Inferior');
    // Estados cargados y diente sin datos.
    expect(html).toContain('>Caries</td>');
    expect(html).toContain('>Endodoncia</td>');
    expect(html).toContain('Sin datos');
  });

  it('incluye la leyenda completa de los 14 estados', () => {
    expect(html).toContain('Leyenda de estados');
    expect(TOOTH_STATUSES).toHaveLength(14);
    for (const status of TOOTH_STATUSES) {
      expect(html).toContain(TOOTH_STATUS_LABELS[status]);
    }
  });

  it('no genera scripts, handlers ni estilos externos', () => {
    expect(html).not.toContain('<script');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('http://');
    expect(html).not.toContain('https://');
  });
});
