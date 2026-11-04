"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { WifiOff } from "lucide-react";

/** Registers the service worker (production only, so dev hot reload is never cached). */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);
  return null;
}

const subscribe = (onChange: () => void) => {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
};

/** Tells the user they are looking at the last saved copy of the screen. */
export function OfflineBanner() {
  const t = useTranslations("offline");
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <p role="status" className="flex items-center justify-center gap-2 bg-brand-indigo px-4 py-2 text-center text-sm font-medium text-brand-offwhite">
      <WifiOff aria-hidden className="size-4 shrink-0" />
      {t("banner")}
    </p>
  );
}

/** Deletes the saved screens on this device (shared phones). */
export async function clearOfflineScreens() {
  try {
    await caches.delete("adupay-pages");
    navigator.serviceWorker?.controller?.postMessage("clear-pages");
  } catch {
    // no Cache API (old browser): nothing was saved
  }
}
