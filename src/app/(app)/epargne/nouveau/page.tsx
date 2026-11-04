import { requireProfile } from "@/server/auth";
import { GoalForm } from "./goal-form";

export default async function NouvelObjectifPage() {
  await requireProfile();
  return <GoalForm today={new Date().toISOString().slice(0, 10)} />;
}
