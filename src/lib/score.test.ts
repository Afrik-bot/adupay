import { describe, expect, it } from "vitest";
import { computeScore, type ScoreInputs } from "./score";

const none: ScoreInputs = { contributionsTotal: 0, contributionsOnTime: 0, cyclesCompleted: 0, savingsWeeks: 0, accountAgeDays: 0 };
const points = (inputs: ScoreInputs) => Object.fromEntries(computeScore(inputs).components.map((c) => [c.part, c.points]));

describe("computeScore", () => {
  it("a brand-new member starts at 0", () => {
    expect(computeScore(none)).toMatchObject({ score: 0, band: "starting" });
  });

  it("a long, perfect record reaches 100", () => {
    const s = computeScore({ contributionsTotal: 24, contributionsOnTime: 24, cyclesCompleted: 8, savingsWeeks: 12, accountAgeDays: 800 });
    expect(s).toMatchObject({ score: 100, band: "excellent", tips: [] });
  });

  it("one on-time payment is not a perfect payment record", () => {
    expect(points({ ...none, contributionsTotal: 1, contributionsOnTime: 1 }).onTime).toBe(4); // 100 % on time × 1/10 of the history
    expect(points({ ...none, contributionsTotal: 10, contributionsOnTime: 10 }).onTime).toBe(40);
  });

  it("late payments lower the on-time part in proportion", () => {
    expect(points({ ...none, contributionsTotal: 10, contributionsOnTime: 7 }).onTime).toBe(28);
    expect(points({ ...none, contributionsTotal: 20, contributionsOnTime: 10 }).onTime).toBe(20);
  });

  it("each part is capped at its weight", () => {
    expect(points({ contributionsTotal: 50, contributionsOnTime: 50, cyclesCompleted: 40, savingsWeeks: 30, accountAgeDays: 5000 })).toEqual({
      onTime: 40,
      cycles: 25,
      savings: 20,
      age: 15,
    });
  });

  it("is safe with inconsistent or negative inputs", () => {
    expect(computeScore({ contributionsTotal: 2, contributionsOnTime: 5, cyclesCompleted: -3, savingsWeeks: Number.NaN, accountAgeDays: -10 }).score).toBe(8);
  });

  it("matches a typical Abidjan member: 8 on time of 9, 3 rounds, saving 6 weeks of 12, 6 months old", () => {
    // on time 8/9 × 9/10 × 40 = 32; rounds 3/6 × 25 = 12.5; savings 6/12 × 20 = 10; age 182/365 × 15 = 7.48 → 61.98
    const s = computeScore({ contributionsTotal: 9, contributionsOnTime: 8, cyclesCompleted: 3, savingsWeeks: 6, accountAgeDays: 182 });
    expect(s.score).toBe(62);
    expect(s.band).toBe("good");
  });

  it("suggests the biggest gains first and never suggests waiting", () => {
    const s = computeScore({ contributionsTotal: 10, contributionsOnTime: 10, cyclesCompleted: 0, savingsWeeks: 6, accountAgeDays: 10 });
    expect(s.tips).toEqual(["cycles", "savings"]); // 25 and 10 points left; age is not a tip
  });
});
