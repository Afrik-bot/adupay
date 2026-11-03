import Link from "next/link";
import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-6">
      <Link href="/" className="flex min-h-12 w-fit items-center text-lg text-foreground" aria-label="AduPay">
        <Logo />
      </Link>
      <main className="flex flex-1 flex-col pt-8">{children}</main>
    </div>
  );
}
