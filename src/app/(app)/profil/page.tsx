import { getLocale, getTranslations } from "next-intl/server";
import { PlaceholderPage } from "@/components/placeholder-page";
import { Preferences } from "./preferences";

export default async function ProfilPage() {
  const t = await getTranslations("profile");
  const locale = await getLocale();
  return (
    <div className="flex flex-col gap-6">
      <PlaceholderPage section="profile" />
      <Preferences
        locale={locale}
        labels={{
          language: t("language"),
          theme: t("theme"),
          light: t("themeLight"),
          dark: t("themeDark"),
          system: t("themeSystem"),
        }}
      />
    </div>
  );
}
