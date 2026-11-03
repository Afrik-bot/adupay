// Shape-based illustrations for the public site. Brand colours only, no raster images,
// so they stay sharp and weigh almost nothing on 3G.

const INDIGO = "#1F2A5A";
const SAFFRON = "#F2A93B";
const OFFWHITE = "#FAF7F2";

/** Hero: members seated round the tontine pot; the pot passes to the highlighted member. */
export function TontineCircle({ className }: { className?: string }) {
  const members = 8;
  const radius = 120;
  return (
    <svg viewBox="0 0 320 320" className={className} aria-hidden>
      <circle cx="160" cy="160" r="150" fill={OFFWHITE} opacity="0.06" />
      <circle cx="160" cy="160" r={radius} fill="none" stroke={OFFWHITE} strokeOpacity="0.25" strokeWidth="2" strokeDasharray="4 10" />
      <g className="motion-safe:animate-[spin_40s_linear_infinite]" style={{ transformOrigin: "160px 160px" }}>
        {Array.from({ length: members }, (_, i) => {
          const angle = (i / members) * Math.PI * 2 - Math.PI / 2;
          const x = 160 + Math.cos(angle) * radius;
          const y = 160 + Math.sin(angle) * radius;
          const turn = i === 0;
          return (
            <g key={i} transform={`translate(${x} ${y})`}>
              <circle r={turn ? 24 : 19} fill={turn ? SAFFRON : OFFWHITE} />
              <circle cy={turn ? -6 : -5} r={turn ? 8 : 6.5} fill={INDIGO} />
              <path d={turn ? "M-13 15 a13 11 0 0 1 26 0" : "M-11 12 a11 9 0 0 1 22 0"} fill={INDIGO} />
            </g>
          );
        })}
      </g>
      <circle cx="160" cy="160" r="52" fill={SAFFRON} />
      <circle cx="160" cy="160" r="38" fill="none" stroke={INDIGO} strokeWidth="3" strokeOpacity="0.3" />
      <circle cx="160" cy="160" r="22" fill={INDIGO} opacity="0.85" />
    </svg>
  );
}

/** Tontine OS: a shared ledger card with paid / due rows. */
export function LedgerShape({ className }: { className?: string }) {
  const rows = [true, true, true, false];
  return (
    <svg viewBox="0 0 200 140" className={className} aria-hidden>
      <rect x="20" y="10" width="160" height="120" rx="14" fill="currentColor" opacity="0.08" />
      {rows.map((paid, i) => (
        <g key={i} transform={`translate(36 ${30 + i * 24})`}>
          <circle r="7" cx="7" cy="0" fill={paid ? SAFFRON : "none"} stroke={SAFFRON} strokeWidth="2.5" />
          {paid && <path d="M3.5 0 l2.5 2.5 l4.5 -5" fill="none" stroke={INDIGO} strokeWidth="2" strokeLinecap="round" />}
          <rect x="24" y="-4" width={70 - i * 6} height="8" rx="4" fill="currentColor" opacity="0.35" />
          <rect x="110" y="-4" width="18" height="8" rx="4" fill="currentColor" opacity={paid ? 0.6 : 0.2} />
        </g>
      ))}
    </svg>
  );
}

/** Payer pour: phone abroad -> verified building at home, with a check. */
export function DirectedPayShape({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 140" className={className} aria-hidden>
      <rect x="18" y="30" width="44" height="80" rx="9" fill="currentColor" opacity="0.12" />
      <rect x="26" y="42" width="28" height="44" rx="3" fill={SAFFRON} opacity="0.85" />
      <path d="M68 62 C 100 30, 110 30, 132 56" fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="3" strokeDasharray="5 7" strokeLinecap="round" />
      <path d="M126 46 l8 10 l-12 3" fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M120 112 V78 L150 60 L180 78 V112 Z" fill="currentColor" opacity="0.12" />
      <rect x="143" y="90" width="14" height="22" rx="2" fill="currentColor" opacity="0.3" />
      <circle cx="170" cy="62" r="15" fill={SAFFRON} />
      <path d="M163 62 l5 5 l9 -10" fill="none" stroke={INDIGO} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Score Communauté: a 0-100 gauge. */
export function ScoreShape({ className }: { className?: string }) {
  const r = 62;
  const half = Math.PI * r;
  const score = 0.72;
  return (
    <svg viewBox="0 0 200 140" className={className} aria-hidden>
      <path d={`M${100 - r} 110 A${r} ${r} 0 0 1 ${100 + r} 110`} fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="16" strokeLinecap="round" />
      <path
        d={`M${100 - r} 110 A${r} ${r} 0 0 1 ${100 + r} 110`}
        fill="none"
        stroke={SAFFRON}
        strokeWidth="16"
        strokeLinecap="round"
        strokeDasharray={`${half * score} ${half}`}
      />
      <text x="100" y="104" textAnchor="middle" fontSize="34" fontWeight="800" fill="currentColor">
        72
      </text>
      <text x="100" y="126" textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.6">
        / 100
      </text>
    </svg>
  );
}
