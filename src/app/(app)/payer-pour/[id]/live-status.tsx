"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Keeps the sender's timeline current: Supabase Realtime pushes the update the
 * moment the payee confirms (RLS decides who may receive it), and a slow poll
 * covers networks where the realtime socket can't stay open.
 */
export function LiveStatus({ id, pollMs = 15_000 }: { id: string; pollMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`directed-payment-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "directed_payments", filter: `id=eq.${id}` }, () =>
        router.refresh(),
      )
      .subscribe();
    const timer = setInterval(() => router.refresh(), pollMs);
    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [id, pollMs, router]);
  return null;
}
