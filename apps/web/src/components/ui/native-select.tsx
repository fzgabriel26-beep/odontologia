import * as React from 'react';
import { cn } from '@/lib/utils';

export interface NativeSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

/**
 * Selector nativo con estilo de input (shadcn no incluye Select en este MVP;
 * el `<select>` nativo ya trae teclado y lector de pantalla de fábrica).
 */
const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, invalid = false, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        invalid && 'border-destructive',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
NativeSelect.displayName = 'NativeSelect';

export { NativeSelect };
