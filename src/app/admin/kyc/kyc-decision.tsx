"use client";

import { reviewKyc } from "../actions";
import { Decision } from "../decision";

export function KycDecision({ recordId }: { recordId: string }) {
  return <Decision onDecide={(approve, reason) => reviewKyc(recordId, approve, reason)} />;
}
