"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/server/auth";
import { sendNotificationsSoon } from "@/server/notifications";

async function managerClient() {
  if (!(await getSessionUser())) redirect("/connexion");
  return createClient();
}

/** Simulated WhatsApp/SMS reminders to every unpaid member; logged as notifications. */
export async function sendReminders(groupId: string, channel: "whatsapp" | "sms"): Promise<{ sent: number } | { error: true }> {
  const supabase = await managerClient();
  const { data, error } = await supabase.rpc("send_group_reminders", { p_group_id: groupId, p_channel: channel });
  if (error) return { error: true };
  sendNotificationsSoon();
  revalidatePath("/tontines/gestion");
  return { sent: data ?? 0 };
}

export async function reviewPenalty(penaltyId: string, confirm: boolean) {
  const supabase = await managerClient();
  await supabase.rpc("review_penalty", { p_penalty_id: penaltyId, p_confirm: confirm });
  revalidatePath("/tontines/gestion");
}
