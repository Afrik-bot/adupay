import { Landmark, Smartphone } from "lucide-react";
import type { WalletProvider } from "@/lib/linked-account";

/** Generic icon per account kind; no operator logos or brand colours. */
export function ProviderIcon({ provider }: { provider: WalletProvider }) {
  const Icon = provider === "bank" ? Landmark : Smartphone;
  return (
    <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary" aria-hidden>
      <Icon className="size-6" />
    </span>
  );
}
