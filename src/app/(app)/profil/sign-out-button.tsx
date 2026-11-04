"use client";

import { useTranslations } from "next-intl";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearOfflineScreens } from "@/components/pwa";
import { signOut } from "./actions";

/** Signs out and forgets the screens saved for offline use. */
export function SignOutButton() {
  const t = useTranslations("auth");
  return (
    <form
      action={async () => {
        await clearOfflineScreens();
        await signOut();
      }}
    >
      <Button type="submit" variant="outline" className="w-full">
        <LogOut aria-hidden />
        {t("signOut")}
      </Button>
    </form>
  );
}
