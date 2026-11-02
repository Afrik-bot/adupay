"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Card } from "@/components/ui/card";
import { setLocale } from "@/i18n/actions";
import { cn } from "@/lib/utils";

interface Props {
  locale: string;
  labels: { language: string; theme: string; light: string; dark: string; system: string };
}

function Segmented({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: { value: string; label: string }[];
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-semibold">{legend}</legend>
      <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg bg-muted p-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "min-h-12 rounded-md text-sm font-medium",
              value === option.value ? "bg-card shadow-sm" : "text-muted-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function Preferences({ locale, labels }: Props) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [, startTransition] = useTransition();

  return (
    <Card>
      <Segmented
        legend={labels.language}
        value={locale}
        options={[
          { value: "fr", label: "Français" },
          { value: "en", label: "English" },
        ]}
        onChange={(next) =>
          startTransition(async () => {
            await setLocale(next);
            router.refresh();
          })
        }
      />
      <Segmented
        legend={labels.theme}
        value={theme}
        options={[
          { value: "light", label: labels.light },
          { value: "dark", label: labels.dark },
          { value: "system", label: labels.system },
        ]}
        onChange={setTheme}
      />
    </Card>
  );
}
