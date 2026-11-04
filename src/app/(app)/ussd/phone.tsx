"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { ussdStep } from "./actions";

type Screen = { state: "idle" } | { state: "open"; path: string; text: string } | { state: "ended"; text: string };

/** A feature-phone style USSD session: each answer is appended to the path, like a gateway does. */
export function UssdPhone() {
  const t = useTranslations("ussdSim");
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>({ state: "idle" });
  const [answer, setAnswer] = useState("");
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const answerId = useId();

  const send = (path: string) =>
    startTransition(async () => {
      const reply = await ussdStep(path);
      setAnswer("");
      if ("error" in reply) return setScreen({ state: "ended", text: t("error") });
      if (reply.end) {
        setScreen({ state: "ended", text: reply.text });
        router.refresh(); // a payment or language change shows up in the app
      } else {
        setScreen({ state: "open", path, text: reply.text });
        inputRef.current?.focus();
      }
    });

  return (
    <div className="mx-auto flex w-full max-w-xs flex-col gap-4 rounded-[2rem] border-4 border-brand-indigo bg-brand-indigo p-4">
      <output
        aria-live="polite"
        className="flex min-h-56 flex-col justify-between rounded-xl bg-[#dfe8d0] p-4 font-mono text-sm leading-relaxed whitespace-pre-line text-[#1b2a12]"
      >
        {screen.state === "idle" ? "*123#" : screen.text}
        {screen.state === "ended" && <span className="mt-3 block text-xs opacity-70">{t("ended")}</span>}
      </output>
      {screen.state === "open" ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const value = answer.trim();
            if (/^\d{1,2}$/.test(value)) send(screen.path ? `${screen.path}*${value}` : value);
          }}
        >
          <label htmlFor={answerId} className="text-sm font-medium text-brand-offwhite">
            {t("answer")}
          </label>
          <input
            ref={inputRef}
            id={answerId}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={2}
            autoComplete="off"
            value={answer}
            onChange={(e) => setAnswer(e.target.value.replace(/\D/g, ""))}
            className={inputClass}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={() => setScreen({ state: "idle" })} disabled={pending}>
              {t("hangUp")}
            </Button>
            <Button type="submit" variant="accent" disabled={pending || !answer}>
              {t("send")}
            </Button>
          </div>
        </form>
      ) : (
        <Button type="button" variant="accent" onClick={() => send("")} disabled={pending}>
          {screen.state === "ended" ? t("redial") : t("dial")}
        </Button>
      )}
    </div>
  );
}
