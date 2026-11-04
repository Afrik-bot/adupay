/** A half-circle 0–100 gauge (shapes only, brand colours). */
export function ScoreGauge({ score, label, className }: { score: number; label: string; className?: string }) {
  const r = 62;
  const half = Math.PI * r;
  return (
    <svg viewBox="0 0 200 130" className={className} role="img" aria-label={label}>
      <path d={`M${100 - r} 112 A${r} ${r} 0 0 1 ${100 + r} 112`} fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="16" strokeLinecap="round" />
      {score > 0 && (
        <path
          d={`M${100 - r} 112 A${r} ${r} 0 0 1 ${100 + r} 112`}
          fill="none"
          stroke="#F2A93B"
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={`${(half * score) / 100} ${half}`}
        />
      )}
      <text x="100" y="104" textAnchor="middle" fontSize="38" fontWeight="800" fill="currentColor">
        {score}
      </text>
      <text x="100" y="126" textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.6">
        / 100
      </text>
    </svg>
  );
}
