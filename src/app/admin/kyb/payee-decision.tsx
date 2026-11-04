"use client";

import { reviewPayee } from "../actions";
import { Decision } from "../decision";

export function PayeeDecision({ payeeId }: { payeeId: string }) {
  return <Decision onDecide={(approve, reason) => reviewPayee(payeeId, approve, reason)} />;
}
