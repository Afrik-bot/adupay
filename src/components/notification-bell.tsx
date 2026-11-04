import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

/** Header bell with the unread count (RLS limits the count to the user's own messages). */
export async function NotificationBell() {
  const t = await getTranslations("notifications");
  const supabase = await createClient();
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  const unread = count ?? 0;
  return (
    <Link href="/notifications" aria-label={t("bell", { count: unread })} className="relative flex size-12 items-center justify-center rounded-full hover:bg-muted">
      <Bell aria-hidden className="size-6" />
      {unread > 0 && (
        <span aria-hidden className="absolute top-1.5 right-1.5 flex min-w-5 items-center justify-center rounded-full bg-accent px-1 text-xs font-bold text-accent-foreground">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
