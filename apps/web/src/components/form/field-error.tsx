/** Mensaje de error de un campo del formulario (validación Zod en el cliente). */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm text-destructive">{message}</p>;
}
