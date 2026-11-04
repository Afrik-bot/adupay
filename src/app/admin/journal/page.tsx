import { getLocale, getTranslations } from "next-intl/server";
import { inputClass } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";

/** The audit log, read-only (it is append-only in the database too). */
export default async function JournalPage({ searchParams }: { searchParams: Promise<{ action?: string }> }) {
  const { action } = await searchParams;
  const t = await getTranslations("admin.audit");
  const locale = await getLocale();
  const supabase = await createClient();
  let query = supabase.from("audit_log").select("id, actor_id, action, target_table, target_id, details, created_at").order("id", { ascending: false }).limit(200);
  if (action) query = query.eq("action", action.slice(0, 60));
  const { data: rows } = await query;
  const actors = [...new Set((rows ?? []).map((r) => r.actor_id).filter(Boolean))] as string[];
  const { data: people } = actors.length ? await supabase.from("profiles").select("id, full_name").in("id", actors) : { data: [] };
  const name = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const when = new Intl.DateTimeFormat(locale === "fr" ? "fr-CI" : "en-GB", { dateStyle: "short", timeStyle: "medium", timeZone: "Africa/Abidjan" });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("lead")}</p>
      </div>
      <form method="get" className="flex gap-2">
        <label htmlFor="action" className="sr-only">
          {t("filter")}
        </label>
        <input id="action" name="action" defaultValue={action ?? ""} placeholder="kyc.review" className={inputClass} />
        <button type="submit" className="min-h-12 rounded-lg border px-4 font-semibold hover:bg-muted">
          {t("submit")}
        </button>
      </form>
      <ul className="divide-y rounded-xl border bg-card">
        {(rows ?? []).map((r) => (
          <li key={r.id} className="flex flex-col gap-1 px-4 py-3 text-sm">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <span className="font-mono font-semibold">{r.action}</span>
              <span className="text-muted-foreground">{when.format(new Date(r.created_at))}</span>
              <span className="text-muted-foreground">{r.actor_id ? (name.get(r.actor_id) ?? r.actor_id.slice(0, 8)) : t("system")}</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {r.target_table} · {r.target_id}
            </span>
            <code className="overflow-x-auto text-xs whitespace-pre-wrap break-all">{JSON.stringify(r.details)}</code>
          </li>
        ))}
        {!rows?.length && <li className="p-5 text-muted-foreground">{t("empty")}</li>}
      </ul>
    </div>
  );
}
