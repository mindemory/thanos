"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

type Theme = "dark" | "light";

const EVENT = "thanos-theme";

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

const current = (): Theme => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

/** Light or dark, remembered on this device. Dark is the default, as in Proxenos and Alexandria. */
export function ThemeToggle({ className, withLabel = false }: { className?: string; withLabel?: boolean }) {
  const theme = useSyncExternalStore(subscribe, current, () => "dark" as Theme);
  const next: Theme = theme === "dark" ? "light" : "dark";
  const flip = () => {
    if (next === "light") document.documentElement.dataset.theme = "light";
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem("thanos.theme", next);
    } catch {
      // private browsing: the choice lasts for this page only
    }
    window.dispatchEvent(new Event(EVENT));
  };
  const Icon = theme === "dark" ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={flip}
      aria-label={`Switch to the ${next} theme`}
      className={cn("flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink", className)}
    >
      <Icon size={16} aria-hidden="true" />
      {withLabel && <span>{next === "light" ? "Light" : "Dark"} theme</span>}
    </button>
  );
}
