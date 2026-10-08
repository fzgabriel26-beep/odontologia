import { cn } from '@/lib/utils';

export type BadgeTone = 'default' | 'success' | 'warning' | 'destructive' | 'info';

const toneClasses: Record<BadgeTone, string> = {
  default: 'border-border bg-secondary text-secondary-foreground',
  success: 'border-emerald-600/30 bg-emerald-50 text-emerald-800',
  warning: 'border-amber-500/40 bg-amber-50 text-amber-800',
  destructive: 'border-destructive/40 bg-destructive/10 text-destructive',
  info: 'border-sky-500/40 bg-sky-50 text-sky-800',
};

/** Etiqueta de estado compacta (activo/inactivo, estados de códigos, etc.). */
export function Badge({
  tone = 'default',
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
