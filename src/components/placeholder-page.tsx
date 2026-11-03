import { getTranslations } from "next-intl/server";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Shared body for tabs whose real screens arrive in later phases. */
export async function PlaceholderPage({ section }: { section: "home" | "tontines" | "payFor" | "savings" | "profile" | "send" }) {
  const t = await getTranslations(section);
  const common = await getTranslations("common");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{common("comingSoon")}</CardTitle>
          <CardDescription>{t("placeholder")}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
