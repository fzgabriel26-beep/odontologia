'use client';

import {
  PERMANENT_TEETH_FDI,
  TEMPORARY_TEETH_FDI,
  TOOTH_STATUS_LABELS,
  TOOTH_STATUSES,
  type ToothStatus,
} from '@odonto/types';
import type { Tooth } from '@/lib/patients';

/**
 * Odontograma FDI en SVG React (SDD §4.7 / fase 6): 52 dientes seleccionables,
 * permanente y temporal. El estado NO depende solo del color: cada diente
 * muestra número FDI + glifo propio + etiqueta en el tooltip/panel, y la
 * leyenda replica glifo + color + texto.
 */

const CELL = 34;
const STEP = 38;
const ROW_WIDTH = 16 * STEP - (STEP - CELL); // 604 px (16 celdas)
const MID_X = ROW_WIDTH / 2; // divisor de cuadrantes
const CENTERED_X = (ROW_WIDTH - (10 * STEP - (STEP - CELL))) / 2; // filas de 10 centradas

/** Fila superior/inferior de cada dentición (orden de visualización FDI). */
const UPPER_PERMANENT = PERMANENT_TEETH_FDI.slice(0, 16);
const LOWER_PERMANENT = PERMANENT_TEETH_FDI.slice(16);
const UPPER_TEMPORARY = TEMPORARY_TEETH_FDI.slice(0, 10);
const LOWER_TEMPORARY = TEMPORARY_TEETH_FDI.slice(10);

/** Fondo por estado (pastel: el texto y el glifo siempre legibles encima). */
export const TOOTH_STATUS_COLORS: Record<ToothStatus, string> = {
  SANO: '#dcfce7',
  CARIES: '#fecaca',
  RESTAURACION: '#bfdbfe',
  CORONA: '#fde68a',
  AUSENTE: '#e5e7eb',
  EXTRACCION_INDICADA: '#fed7aa',
  EXTRACCION_REALIZADA: '#d1d5db',
  ENDODONCIA: '#ddd6fe',
  IMPLANTE: '#cbd5e1',
  PROTESIS: '#a5f3fc',
  FRACTURA: '#fecdd3',
  RETENIDO: '#eaddcf',
  TRATAMIENTO_PENDIENTE: '#fef9c3',
  OTRO: '#f3f4f6',
};

/** Glifo del estado en una caja 14×14 (patrón/icono, complemento del color). */
function StatusGlyph({ status }: { status: ToothStatus }) {
  switch (status) {
    case 'SANO':
      return (
        <polyline
          points="2,7 6,11 12,3"
          fill="none"
          stroke="#166534"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    case 'CARIES':
      return <circle cx="7" cy="7" r="4.5" fill="#7f1d1d" />;
    case 'RESTAURACION':
      return <rect x="2" y="4.5" width="10" height="5.5" rx="1" fill="#1d4ed8" />;
    case 'CORONA':
      return <path d="M2 11 L2 5 L5 7.5 L7 3 L9 7.5 L12 5 L12 11 Z" fill="#b45309" />;
    case 'AUSENTE':
      return (
        <g stroke="#475569" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="3" x2="11" y2="11" />
          <line x1="11" y1="3" x2="3" y2="11" />
        </g>
      );
    case 'EXTRACCION_INDICADA':
      return (
        <g stroke="#c2410c" strokeWidth="1.8" strokeDasharray="2.5 2" strokeLinecap="round">
          <line x1="3" y1="3" x2="11" y2="11" />
          <line x1="11" y1="3" x2="3" y2="11" />
        </g>
      );
    case 'EXTRACCION_REALIZADA':
      return (
        <g stroke="#1e293b" strokeWidth="2.6" strokeLinecap="round">
          <line x1="3" y1="3" x2="11" y2="11" />
          <line x1="11" y1="3" x2="3" y2="11" />
        </g>
      );
    case 'ENDODONCIA':
      return (
        <g stroke="#6d28d9" strokeWidth="1.8" strokeLinecap="round">
          <line x1="5" y1="2" x2="5" y2="12" />
          <line x1="9" y1="2" x2="9" y2="12" />
        </g>
      );
    case 'IMPLANTE':
      return (
        <g stroke="#334155" strokeWidth="1.6" strokeLinecap="round">
          <line x1="4" y1="3" x2="10" y2="3" />
          <line x1="3" y1="7" x2="11" y2="7" />
          <line x1="4" y1="11" x2="10" y2="11" />
        </g>
      );
    case 'PROTESIS':
      return (
        <g fill="none" stroke="#0e7490" strokeWidth="1.8" strokeLinecap="round">
          <path d="M2 8 Q7 2 12 8" />
          <line x1="2" y1="11" x2="12" y2="11" />
        </g>
      );
    case 'FRACTURA':
      return (
        <polyline
          points="8,1 5,6 8,7 5,13"
          fill="none"
          stroke="#be123c"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    case 'RETENIDO':
      return (
        <rect
          x="2"
          y="4.5"
          width="10"
          height="5"
          rx="1"
          fill="#78350f"
          transform="rotate(-25 7 7)"
        />
      );
    case 'TRATAMIENTO_PENDIENTE':
      return (
        <g fill="none" stroke="#a16207" strokeWidth="1.6" strokeLinecap="round">
          <circle cx="7" cy="7" r="5" />
          <path d="M7 4 L7 7 L9.5 8" />
        </g>
      );
    case 'OTRO':
      return (
        <g fill="#475569">
          <circle cx="3" cy="7" r="1.5" />
          <circle cx="7" cy="7" r="1.5" />
          <circle cx="11" cy="7" r="1.5" />
        </g>
      );
  }
}

/** Chip de estado con color + texto (para paneles e historial). */
export function ToothStatusChip({
  status,
  className,
}: {
  status: ToothStatus;
  className?: string;
}) {
  return (
    <span
      className={
        className ??
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium'
      }
    >
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full border"
        style={{ backgroundColor: TOOTH_STATUS_COLORS[status] }}
      />
      {TOOTH_STATUS_LABELS[status]}
    </span>
  );
}

interface OdontogramSvgProps {
  teeth: Tooth[];
  selectedId: string | null;
  onSelect: (tooth: Tooth) => void;
}

export function OdontogramSvg({ teeth, selectedId, onSelect }: OdontogramSvgProps) {
  const byFdi = new Map(teeth.map((tooth) => [tooth.fdiNumber, tooth]));

  const cell = (fdi: number, x: number, y: number) => {
    const tooth = byFdi.get(fdi);
    const status = tooth?.currentStatus ?? null;
    const selected = tooth !== undefined && tooth.id === selectedId;
    const label = status ? TOOTH_STATUS_LABELS[status] : 'Sin datos';
    return (
      <g
        key={fdi}
        transform={`translate(${x},${y})`}
        role="button"
        tabIndex={0}
        aria-label={`Diente ${fdi}: ${label}`}
        className={tooth ? 'cursor-pointer' : ''}
        onClick={() => {
          if (tooth) onSelect(tooth);
        }}
        onKeyDown={(event) => {
          if (tooth && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            onSelect(tooth);
          }
        }}
      >
        <title>{`${fdi} · ${label}`}</title>
        <rect
          width={CELL}
          height={CELL}
          rx="4"
          fill={status ? TOOTH_STATUS_COLORS[status] : '#f1f5f9'}
          stroke={selected ? '#2563eb' : '#94a3b8'}
          strokeWidth={selected ? 2.5 : 1}
        />
        <text x={CELL / 2} y="12" textAnchor="middle" fontSize="10" fontWeight="600" fill="#0f172a">
          {fdi}
        </text>
        <g transform="translate(10,15)">{status ? <StatusGlyph status={status} /> : null}</g>
        {selected ? (
          <rect
            x="-3"
            y="-3"
            width={CELL + 6}
            height={CELL + 6}
            rx="7"
            fill="none"
            stroke="#2563eb"
            strokeWidth="2"
          />
        ) : null}
      </g>
    );
  };

  const row = (numbers: readonly number[], y: number, x0: number) => (
    <g key={`row-${y}`}>
      <line x1={MID_X} y1={y} x2={MID_X} y2={y + CELL} stroke="#cbd5e1" strokeDasharray="3 3" />
      {numbers.map((fdi, index) => cell(fdi, x0 + index * STEP, y))}
    </g>
  );

  return (
    <svg
      viewBox={`0 0 ${ROW_WIDTH} 182`}
      className="w-full max-w-[640px]"
      role="img"
      aria-label="Odontograma FDI interactivo"
    >
      <text x="0" y="10" fontSize="11" fill="#64748b">
        Dentición permanente
      </text>
      {row(UPPER_PERMANENT, 16, 0)}
      {row(LOWER_PERMANENT, 54, 0)}
      <text x="0" y="104" fontSize="11" fill="#64748b">
        Dentición temporal
      </text>
      {row(UPPER_TEMPORARY, 110, CENTERED_X)}
      {row(LOWER_TEMPORARY, 148, CENTERED_X)}
    </svg>
  );
}

/** Leyenda: glifo + color + texto para los 14 estados dentales. */
export function OdontogramLegend() {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-4">
      {TOOTH_STATUSES.map((status) => (
        <span key={status} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            className="shrink-0 rounded-[2px] border border-slate-300"
            style={{ backgroundColor: TOOTH_STATUS_COLORS[status] }}
            aria-hidden="true"
          >
            <StatusGlyph status={status} />
          </svg>
          {TOOTH_STATUS_LABELS[status]}
        </span>
      ))}
    </div>
  );
}
