"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/server/auth";

export async function markAllRead() {
  if (!(await getSessionUser())) return;
  const supabase = await createClient();
  await supabase.rpc("mark_notifications_read");
  revalidatePath("/", "layout");
}
