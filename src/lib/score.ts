// Score Communauté: 0–100, from how someone saves with their community.
// Each part only reaches its full weight after real activity, so a single
// on-time payment cannot produce a top score.

export interface ScoreInputs {
  contributionsTotal: number;
  contributionsOnTime: number;
  cyclesCompleted: number;
  /** Weeks, out of the last 12, with a savings deposit. */
  savingsWeeks: number;
  accountAgeDays: number;
}

export type ScorePart = "onTime" | "cycles" | "savings" | "age";

export interface ScoreComponent {
  part: ScorePart;
  points: number;
  max: number;
}

export interface Score {
  score: number;
  components: ScoreComponent[];
  /** What would raise the score most, biggest gain first. */
  tips: ScorePart[];
  band: "starting" | "building" | "good" | "excellent";
}

export const SCORE_WEIGHTS: Record<ScorePart, number> = { onTime: 40, cycles: 25, savings: 20, age: 15 };
/** Activity needed for a part to count fully. */
export const SCORE_FULL_AT = { contributions: 10, cycles: 6, savingsWeeks: 12, accountAgeDays: 365 } as const;

const clamp01 = (x: number) => Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0));

export function computeScore(inputs: ScoreInputs): Score {
  const total = Math.max(0, inputs.contributionsTotal);
  const onTime = Math.min(total, Math.max(0, inputs.contributionsOnTime));
  // The on-time rate, weighted by how much history there is behind it.
  const onTimePart = total === 0 ? 0 : (onTime / total) * clamp01(total / SCORE_FULL_AT.contributions);

  const raw: Record<ScorePart, number> = {
    onTime: onTimePart,
    cycles: clamp01(inputs.cyclesCompleted / SCORE_FULL_AT.cycles),
    savings: clamp01(inputs.savingsWeeks / SCORE_FULL_AT.savingsWeeks),
    age: clamp01(inputs.accountAgeDays / SCORE_FULL_AT.accountAgeDays),
  };

  const components = (Object.keys(SCORE_WEIGHTS) as ScorePart[]).map((part) => ({
    part,
    points: Math.round(raw[part] * SCORE_WEIGHTS[part]),
    max: SCORE_WEIGHTS[part],
  }));
  const score = Math.min(100, Math.round((Object.keys(SCORE_WEIGHTS) as ScorePart[]).reduce((s, p) => s + raw[p] * SCORE_WEIGHTS[p], 0)));

  // Tips: the parts with the most points still to gain. Account age can't be
  // hurried, so it is never suggested.
  const tips = components
    .filter((c) => c.part !== "age" && c.points < c.max)
    .sort((a, b) => b.max - b.points - (a.max - a.points))
    .map((c) => c.part);

  const band = score >= 80 ? "excellent" : score >= 60 ? "good" : score >= 30 ? "building" : "starting";
  return { score, components, tips, band };
}
