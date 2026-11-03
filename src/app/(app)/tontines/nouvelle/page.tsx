import { getLocale } from "next-intl/server";
import { requireProfile } from "@/server/auth";
import { CreateTontineWizard } from "./wizard";

export default async function NouvelleTontinePage() {
  await requireProfile();
  return <CreateTontineWizard locale={await getLocale()} today={new Date().toISOString().slice(0, 10)} />;
}
