import { getLocale, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { CaseControls } from "./case-controls";

const STATUSES = ["open", "reviewing", "escalated", "closed"] as const;
const SEVERITY = { high: "bg-destructive/15 text-destructive", medium: "bg-warning/15 text-warning", low: "bg-muted text-muted-foreground" };

export default async function RisksPage({ searchParams }: { searchParams: Promise<{ statut?: string }> }) {
  const { statut } = await searchParams;
  const t = await getTranslations("admin.risks");
  const locale = await getLocale();
  const supabase = await createClient();
  const active = STATUSES.includes(statut as never) ? (statut as (typeof STATUSES)[number]) : null;
  let query = supabase.from("risk_events").select("id, kind, severity, status, subject_user_id, payment_id, details, created_at").order("created_at", { ascending: false }).limit(100);
  query = active ? query.eq("status", active) : query.in("status", ["open", "reviewing", "escalated"]);
  const { data: cases } = await query;
  const ids = (cases ?? []).map((c) => c.id);
  const subjects = [...new Set((cases ?? []).map((c) => c.subject_user_id).filter(Boolean))] as string[];
  const [{ data: notes }, { data: people }] = await Promise.all([
    ids.length ? supabase.from("risk_event_notes").select("risk_event_id, note, status_change, created_at, author_id").in("risk_event_id", ids).order("id") : Promise.resolve({ data: [] }),
    subjects.length ? supabase.from("profiles").select("id, full_name").in("id", subjects) : Promise.resolve({ data: [] }),
  ]);
  const person = new Map((people ?? []).map((p) => [p.id, p]));
  const { data: flags } = await supabase.rpc("admin_sanctions_flags", { p_profile_ids: subjects, p_payee_ids: [] });
  const flagged = new Set((flags ?? []).filter((f) => f.sanctions_status === "hit").map((f) => f.id));
  const when = new Intl.DateTimeFormat(locale === "fr" ? "fr-CI" : "en-GB", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Abidjan" });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <nav aria-label={t("filter")} className="flex flex-wrap gap-1">
        <a href="/admin/risques" aria-current={!active ? "page" : undefined} className={cn("flex min-h-12 items-center rounded-lg border px-3 text-sm font-semibold", !active && "bg-primary text-primary-foreground")}>
          {t("toHandle")}
        </a>
        {STATUSES.map((s) => (
          <a key={s} href={`/admin/risques?statut=${s}`} aria-current={active === s ? "page" : undefined} className={cn("flex min-h-12 items-center rounded-lg border px-3 text-sm font-semibold", active === s && "bg-primary text-primary-foreground")}>
            {t(`statuses.${s}`)}
          </a>
        ))}
      </nav>
      {!cases?.length && <p className="rounded-xl border border-dashed p-5 text-muted-foreground">{t("empty")}</p>}
      {(cases ?? []).map((c) => {
        const subject = c.subject_user_id ? person.get(c.subject_user_id) : null;
        const details = (c.details ?? {}) as Record<string, unknown>;
        const sanctionsSubject =
          c.kind === "sanctions_hit"
            ? details.subject === "payee"
              ? { kind: "payee" as const, id: String(details.payee_id) }
              : subject && flagged.has(subject.id)
                ? { kind: "profile" as const, id: subject.id }
                : null
            : null;
        return (
          <Card key={c.id}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", SEVERITY[c.severity])}>{t(`severity.${c.severity}`)}</span>
              <h2 className="font-semibold">{t.has(`kinds.${c.kind}`) ? t(`kinds.${c.kind}` as "kinds.velocity_1h") : c.kind}</h2>
              <span className="ml-auto text-sm text-muted-foreground">
                {t(`statuses.${c.status}`)} · {when.format(new Date(c.created_at))}
              </span>
            </div>
            {subject && <p className="text-sm">{t("subject", { name: subject.full_name ?? "" })}</p>}
            <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">{JSON.stringify(details, null, 2)}</pre>
            {(notes ?? []).filter((n) => n.risk_event_id === c.id).length > 0 && (
              <ul className="flex flex-col gap-1 border-l-2 pl-3 text-sm">
                {(notes ?? [])
                  .filter((n) => n.risk_event_id === c.id)
                  .map((n, i) => (
                    <li key={i}>
                      <span className="text-muted-foreground">{when.format(new Date(n.created_at))}</span>
                      {n.status_change ? <span className="font-semibold"> · {n.status_change}</span> : null} — {n.note}
                    </li>
                  ))}
              </ul>
            )}
            <CaseControls id={c.id} status={c.status} sanctions={sanctionsSubject} />
          </Card>
        );
      })}
    </div>
  );
}
