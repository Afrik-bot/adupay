import { cn } from "@/lib/utils";

// AduPay mark: a tontine ring of six members around the pot; the light segment is
// the member whose turn it is to receive. Keep in sync with public/brand/*.svg.
const RING_R = 18;
const SEGMENTS = 6;
const GAP = 5;
const CIRCUMFERENCE = 2 * Math.PI * RING_R;
const DASH = CIRCUMFERENCE / SEGMENTS - GAP;

export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("size-9 shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <rect width="64" height="64" rx="16" fill="#1F2A5A" />
      <g transform={`rotate(${-90 + ((GAP / 2) / CIRCUMFERENCE) * 360} 32 32)`} fill="none" strokeWidth="7" strokeLinecap="butt">
        <circle cx="32" cy="32" r={RING_R} stroke="#F2A93B" strokeDasharray={`${DASH} ${GAP}`} />
        <circle cx="32" cy="32" r={RING_R} stroke="#FAF7F2" strokeDasharray={`${DASH} ${CIRCUMFERENCE - DASH}`} />
      </g>
      <circle cx="32" cy="32" r="6.5" fill="#F2A93B" />
    </svg>
  );
}

/** "AduPay" drawn as monoline paths, so it renders identically without any font. */
export const WORDMARK_PATHS = [
  "M4 42 L18 6 L32 42 M9.4 30 H26.6", // A
  "M70 6 V42 M70 30 A12 12 0 1 1 46 30 A12 12 0 1 1 70 30", // d
  "M84 18 V30 A12 12 0 0 0 108 30 M108 18 V42", // u
  "M122 42 V6 H130 A12 12 0 0 1 130 30 H122", // P
  "M180 18 V42 M180 30 A12 12 0 1 1 156 30 A12 12 0 1 1 180 30", // a
  "M194 18 V28 A12 12 0 0 0 218 28 M218 18 V48 A12 12 0 0 1 206 60 H200", // y
];

export function Wordmark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 222 64" className={cn("h-6 w-auto", className)} aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
        {WORDMARK_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </svg>
  );
}

export function Logo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={markClassName} />
      <Wordmark className="mt-1.5 h-[1.15em]" />
      <span className="sr-only">AduPay</span>
    </span>
  );
}
