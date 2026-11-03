import { Check, Circle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TimelineStep {
  label: string;
  at: string | null;
  hint?: string;
}

/** Payé → Reçu → Confirmé, with the time each step happened. */
export function PaymentTimeline({ steps, failed, failedLabel, format }: { steps: TimelineStep[]; failed?: boolean; failedLabel?: string; format: (iso: string) => string }) {
  return (
    <ol className="flex flex-col">
      {steps.map((step, i) => {
        const done = Boolean(step.at);
        const last = i === steps.length - 1;
        return (
          <li key={step.label} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full border-2",
                  done ? "border-success bg-success text-white" : "border-border bg-card text-muted-foreground",
                )}
              >
                {done ? <Check aria-hidden className="size-4" /> : <Circle aria-hidden className="size-3" />}
              </span>
              {!last && <span className={cn("w-0.5 flex-1", done ? "bg-success" : "bg-border")} aria-hidden />}
            </div>
            <div className={cn("pb-5", last && "pb-0")}>
              <p className={cn("font-semibold", !done && "text-muted-foreground")}>{step.label}</p>
              {step.at ? (
                <p className="text-sm text-muted-foreground">{format(step.at)}</p>
              ) : (
                step.hint && <p className="text-sm text-muted-foreground">{step.hint}</p>
              )}
            </div>
          </li>
        );
      })}
      {failed && (
        <li className="mt-2 flex items-center gap-3 font-semibold text-destructive">
          <XCircle aria-hidden className="size-8" />
          {failedLabel}
        </li>
      )}
    </ol>
  );
}
