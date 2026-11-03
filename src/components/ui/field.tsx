import { cn } from "@/lib/utils";

/** Shared input styling: 48px targets, visible focus, error state via aria-invalid. */
export const inputClass =
  "min-h-12 w-full rounded-lg border bg-card px-3 text-base outline-none focus-visible:ring-[3px] focus-visible:ring-ring aria-[invalid=true]:border-destructive";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-semibold">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${htmlFor}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${htmlFor}-error`} role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
