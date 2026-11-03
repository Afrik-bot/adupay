"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-reads a pending receipt every few seconds until the rail confirms (max ~2 minutes). */
export function AutoRefresh({ everyMs = 3000, maxTries = 40 }: { everyMs?: number; maxTries?: number }) {
  const router = useRouter();
  useEffect(() => {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (tries > maxTries) return clearInterval(timer);
      router.refresh();
    }, everyMs);
    return () => clearInterval(timer);
  }, [router, everyMs, maxTries]);
  return null;
}
