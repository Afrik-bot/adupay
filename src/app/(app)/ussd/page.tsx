import { getTranslations } from "next-intl/server";
import { UssdPhone } from "./phone";

export default async function UssdPage() {
  const t = await getTranslations("ussdSim");
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("lead")}</p>
      </div>
      <UssdPhone />
      <p className="text-sm text-muted-foreground">{t("hint")}</p>
    </div>
  );
}
