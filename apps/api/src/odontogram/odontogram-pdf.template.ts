import {
  PERMANENT_TEETH_FDI,
  TEMPORARY_TEETH_FDI,
  TOOTH_STATUS_COLORS,
  TOOTH_STATUS_LABELS,
  TOOTH_STATUSES,
  type ToothStatus,
} from '@odonto/types';

/**
 * Template HTML del PDF del odontograma (SDD CU-11 / ADR-004 / fase 10).
 * El backend lo renderiza con Playwright (A4 horizontal). Contenido mínimo
 * exigido por el spec: encabezado, datos del paciente, odontograma FDI (SVG),
 * estados por diente y leyenda. El estado nunca depende solo del color: cada
 * celda lleva número FDI + glifo, y la tabla de estados agrega el texto.
 */

/** Datos del paciente necesarios para el encabezado. */
export interface PdfPatient {
  firstName: string;
  lastName: string;
  dni: string;
  birthDate: Date | null;
}

/** Diente con su estado actual (forma mínima del modelo Prisma). */
export interface PdfTooth {
  fdiNumber: number;
  currentStatus: string | null;
}

export interface OdontogramHtmlInput {
  patient: PdfPatient;
  teeth: PdfTooth[];
  /** Momento de exportación (hora local del servidor). */
  exportedAt: Date;
  /** "Apellido, Nombre" de quien exporta. */
  exportedBy: string;
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

/** Escapa todo texto derivado de datos (nombres/apellidos/libre). */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Fecha date-only de Prisma (@db.Date, medianoche UTC) sin corrimiento por TZ. */
function formatDateOnly(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getUTCFullYear()}`;
}

/** Fecha y hora locales (exportación). */
function formatDateTime(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()} ${hours}:${minutes}`;
}

/** Edad en años cumplidos (o "—" sin fecha). */
function ageOf(birthDate: Date | null): string {
  if (!birthDate) return '—';
  const now = new Date();
  let years = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birthDate.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birthDate.getUTCDate())) {
    years -= 1;
  }
  return years >= 0 ? `${years} años` : '—';
}

/** Etiqueta del estado; tolera valores fuera del catálogo. */
function statusLabel(status: string | null): string {
  if (!status) return 'Sin datos';
  return TOOTH_STATUS_LABELS[status as ToothStatus] ?? 'Otro';
}

function statusColor(status: string | null): string {
  if (!status) return '#f1f5f9';
  return TOOTH_STATUS_COLORS[status as ToothStatus] ?? TOOTH_STATUS_COLORS.OTRO;
}

/* ------------------------------------------------------------------ */
/* Glifos SVG (mismos del odontograma web, fase 6)                     */
/* ------------------------------------------------------------------ */

/** Contenido SVG del glifo del estado, en una caja 14×14. */
function statusGlyphSvg(status: string | null): string {
  switch (status) {
    case 'SANO':
      return '<polyline points="2,7 6,11 12,3" fill="none" stroke="#166534" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
    case 'CARIES':
      return '<circle cx="7" cy="7" r="4.5" fill="#7f1d1d"/>';
    case 'RESTAURACION':
      return '<rect x="2" y="4.5" width="10" height="5.5" rx="1" fill="#1d4ed8"/>';
    case 'CORONA':
      return '<path d="M2 11 L2 5 L5 7.5 L7 3 L9 7.5 L12 5 L12 11 Z" fill="#b45309"/>';
    case 'AUSENTE':
      return '<g stroke="#475569" stroke-width="2" stroke-linecap="round"><line x1="3" y1="3" x2="11" y2="11"/><line x1="11" y1="3" x2="3" y2="11"/></g>';
    case 'EXTRACCION_INDICADA':
      return '<g stroke="#c2410c" stroke-width="1.8" stroke-dasharray="2.5 2" stroke-linecap="round"><line x1="3" y1="3" x2="11" y2="11"/><line x1="11" y1="3" x2="3" y2="11"/></g>';
    case 'EXTRACCION_REALIZADA':
      return '<g stroke="#1e293b" stroke-width="2.6" stroke-linecap="round"><line x1="3" y1="3" x2="11" y2="11"/><line x1="11" y1="3" x2="3" y2="11"/></g>';
    case 'ENDODONCIA':
      return '<g stroke="#6d28d9" stroke-width="1.8" stroke-linecap="round"><line x1="5" y1="2" x2="5" y2="12"/><line x1="9" y1="2" x2="9" y2="12"/></g>';
    case 'IMPLANTE':
      return '<g stroke="#334155" stroke-width="1.6" stroke-linecap="round"><line x1="4" y1="3" x2="10" y2="3"/><line x1="3" y1="7" x2="11" y2="7"/><line x1="4" y1="11" x2="10" y2="11"/></g>';
    case 'PROTESIS':
      return '<g fill="none" stroke="#0e7490" stroke-width="1.8" stroke-linecap="round"><path d="M2 8 Q7 2 12 8"/><line x1="2" y1="11" x2="12" y2="11"/></g>';
    case 'FRACTURA':
      return '<polyline points="8,1 5,6 8,7 5,13" fill="none" stroke="#be123c" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
    case 'RETENIDO':
      return '<rect x="2" y="4.5" width="10" height="5" rx="1" fill="#78350f" transform="rotate(-25 7 7)"/>';
    case 'TRATAMIENTO_PENDIENTE':
      return '<g fill="none" stroke="#a16207" stroke-width="1.6" stroke-linecap="round"><circle cx="7" cy="7" r="5"/><path d="M7 4 L7 7 L9.5 8"/></g>';
    case 'OTRO':
      return '<g fill="#475569"><circle cx="3" cy="7" r="1.5"/><circle cx="7" cy="7" r="1.5"/><circle cx="11" cy="7" r="1.5"/></g>';
    default:
      return '';
  }
}

/* ------------------------------------------------------------------ */
/* Odontograma SVG (misma geometría que el componente web)             */
/* ------------------------------------------------------------------ */

const CELL = 34;
const STEP = 38;
const ROW_WIDTH = 16 * STEP - (STEP - CELL); // 604
const MID_X = ROW_WIDTH / 2;
const CENTERED_X = (ROW_WIDTH - (10 * STEP - (STEP - CELL))) / 2;

const UPPER_PERMANENT = PERMANENT_TEETH_FDI.slice(0, 16);
const LOWER_PERMANENT = PERMANENT_TEETH_FDI.slice(16);
const UPPER_TEMPORARY = TEMPORARY_TEETH_FDI.slice(0, 10);
const LOWER_TEMPORARY = TEMPORARY_TEETH_FDI.slice(10);

function toothCellSvg(fdi: number, x: number, y: number, status: string | null): string {
  const label = statusLabel(status);
  return [
    `<g transform="translate(${x},${y})">`,
    `<title>${fdi} · ${escapeHtml(label)}</title>`,
    `<rect width="${CELL}" height="${CELL}" rx="4" fill="${statusColor(status)}" stroke="#94a3b8" stroke-width="1"/>`,
    `<text x="${CELL / 2}" y="12" text-anchor="middle" font-size="10" font-weight="600" fill="#0f172a">${fdi}</text>`,
    `<g transform="translate(10,15)">${statusGlyphSvg(status)}</g>`,
    '</g>',
  ].join('');
}

function rowSvg(
  numbers: readonly number[],
  y: number,
  x0: number,
  byFdi: Map<number, PdfTooth>,
): string {
  const cells = numbers
    .map((fdi, index) =>
      toothCellSvg(fdi, x0 + index * STEP, y, byFdi.get(fdi)?.currentStatus ?? null),
    )
    .join('');
  return (
    `<line x1="${MID_X}" y1="${y}" x2="${MID_X}" y2="${y + CELL}" stroke="#cbd5e1" stroke-dasharray="3 3"/>` +
    cells
  );
}

function odontogramSvg(byFdi: Map<number, PdfTooth>): string {
  return [
    '<svg viewBox="0 0 604 182" class="odontogram-svg" role="img" aria-label="Odontograma FDI">',
    '<text x="0" y="10" font-size="11" fill="#64748b">Dentición permanente</text>',
    rowSvg(UPPER_PERMANENT, 16, 0, byFdi),
    rowSvg(LOWER_PERMANENT, 54, 0, byFdi),
    '<text x="0" y="104" font-size="11" fill="#64748b">Dentición temporal</text>',
    rowSvg(UPPER_TEMPORARY, 110, CENTERED_X, byFdi),
    rowSvg(LOWER_TEMPORARY, 148, CENTERED_X, byFdi),
    '</svg>',
  ].join('');
}

/* ------------------------------------------------------------------ */
/* Tabla de estados por diente (texto, legible en B/N)                */
/* ------------------------------------------------------------------ */

function stateCells(numbers: readonly number[], byFdi: Map<number, PdfTooth>): string {
  return numbers
    .map((fdi) => {
      const tooth = byFdi.get(fdi);
      const label = statusLabel(tooth?.currentStatus ?? null);
      const className = tooth?.currentStatus ? 'state' : 'state muted';
      return `<td class="${className}">${escapeHtml(label)}</td>`;
    })
    .join('');
}

function statesTable(
  title: string,
  upper: readonly number[],
  lower: readonly number[],
  byFdi: Map<number, PdfTooth>,
): string {
  const header = upper.map((fdi) => `<th scope="col">${fdi}</th>`).join('');
  return [
    `<h3>${title}</h3>`,
    '<table class="states">',
    `<thead><tr><th class="corner" scope="col">FDI</th>${header}</tr></thead>`,
    '<tbody>',
    `<tr><th scope="row">Superior</th>${stateCells(upper, byFdi)}</tr>`,
    `<tr><th scope="row">Inferior</th>${stateCells(lower, byFdi)}</tr>`,
    '</tbody>',
    '</table>',
  ].join('');
}

/* ------------------------------------------------------------------ */
/* Leyenda                                                             */
/* ------------------------------------------------------------------ */

function legendHtml(): string {
  return TOOTH_STATUSES.map(
    (status) =>
      `<span class="legend-item">` +
      `<span class="legend-swatch" style="background:${TOOTH_STATUS_COLORS[status]}">` +
      `<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">${statusGlyphSvg(status)}</svg>` +
      `</span>${escapeHtml(TOOTH_STATUS_LABELS[status])}</span>`,
  ).join('');
}

/* ------------------------------------------------------------------ */
/* Documento completo                                                  */
/* ------------------------------------------------------------------ */

const STYLES = `
* { box-sizing: border-box; }
body {
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  color: #0f172a;
  font-size: 11px;
  margin: 0;
}
header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  border-bottom: 2px solid #0f172a;
  padding-bottom: 8px;
  margin-bottom: 10px;
}
.app-name {
  font-size: 11px;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.doc-title { font-size: 18px; font-weight: 700; margin-top: 2px; }
.meta { text-align: right; font-size: 10.5px; color: #334155; line-height: 1.5; }
.patient {
  display: flex;
  gap: 28px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 8px 14px;
  margin-bottom: 12px;
}
.patient .label {
  display: block;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #64748b;
  margin-bottom: 2px;
}
.patient .value { font-size: 12px; font-weight: 600; }
h2 {
  font-size: 13px;
  margin: 12px 0 6px;
  border-bottom: 1px solid #cbd5e1;
  padding-bottom: 3px;
}
h3 { font-size: 11.5px; margin: 8px 0 4px; color: #334155; }
.odontogram-wrap { text-align: center; }
.odontogram-svg { width: 100%; max-width: 700px; }
table.states {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  margin-bottom: 6px;
}
table.states th, table.states td {
  border: 1px solid #cbd5e1;
  padding: 3px 2px;
  font-size: 8.5px;
  text-align: center;
  height: 26px;
  vertical-align: middle;
  overflow-wrap: break-word;
}
table.states thead th { background: #f1f5f9; font-weight: 600; font-size: 9.5px; }
table.states th.corner { width: 70px; text-align: left; }
table.states tbody th { background: #f8fafc; font-weight: 600; font-size: 9px; width: 70px; text-align: left; }
td.state { color: #0f172a; }
td.muted { color: #94a3b8; }
.legend { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px 18px; }
.legend-item { display: flex; align-items: center; gap: 6px; font-size: 10px; color: #334155; }
.legend-swatch {
  width: 16px;
  height: 16px;
  border: 1px solid #cbd5e1;
  border-radius: 2px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
footer {
  margin-top: 12px;
  padding-top: 6px;
  border-top: 1px solid #cbd5e1;
  font-size: 9px;
  color: #94a3b8;
  display: flex;
  justify-content: space-between;
}
`;

/** Construye el HTML completo del PDF del odontograma. */
export function buildOdontogramHtml(input: OdontogramHtmlInput): string {
  const { patient, teeth, exportedAt, exportedBy } = input;
  const byFdi = new Map(teeth.map((tooth) => [tooth.fdiNumber, tooth]));

  const fullName = escapeHtml(`${patient.lastName}, ${patient.firstName}`);
  const birth = patient.birthDate ? formatDateOnly(patient.birthDate) : '—';

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<title>Odontograma ${fullName}</title>
<style>${STYLES}</style>
</head>
<body>
<header>
  <div>
    <div class="app-name">Sistema de Gestión Odontológica</div>
    <div class="doc-title">Odontograma FDI</div>
  </div>
  <div class="meta">
    <div>Fecha de exportación: ${formatDateTime(exportedAt)}</div>
    <div>Exportado por: ${escapeHtml(exportedBy)}</div>
  </div>
</header>

<section class="patient">
  <div><span class="label">Paciente</span><span class="value">${fullName}</span></div>
  <div><span class="label">DNI</span><span class="value">${escapeHtml(patient.dni)}</span></div>
  <div><span class="label">Fecha de nacimiento</span><span class="value">${birth}</span></div>
  <div><span class="label">Edad</span><span class="value">${ageOf(patient.birthDate)}</span></div>
</section>

<h2>Odontograma</h2>
<div class="odontogram-wrap">${odontogramSvg(byFdi)}</div>

<h2>Estados por diente</h2>
${statesTable('Dentición permanente', UPPER_PERMANENT, LOWER_PERMANENT, byFdi)}
${statesTable('Dentición temporal', UPPER_TEMPORARY, LOWER_TEMPORARY, byFdi)}

<h2>Leyenda de estados</h2>
<div class="legend">${legendHtml()}</div>

<footer>
  <span>Documento generado por el Sistema de Gestión Odontológica.</span>
  <span>El registro original permanece en el sistema (historia clínica inmutable).</span>
</footer>
</body>
</html>`;
}
