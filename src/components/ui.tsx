import { cn } from "@/lib/utils";

// Small pieces every page uses: button and field styles, notes, labelled fields. The ones that
// need the browser (forms that keep what was typed, copying, confirming) are in client.tsx.

export const BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface-2 px-3.5 py-2 text-sm text-ink transition-colors hover:border-accent/40 hover:bg-surface-3 disabled:opacity-50";
export const PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50";
export const QUIET = "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-ink";
// A field's edge is the only thing that shows it's there, so it's darker than other borders; with
// focus it takes the page's focus ring, like everything else.
export const INPUT =
  "w-full rounded-xl border border-field bg-surface px-3.5 py-2.5 text-ink placeholder:text-faint focus:border-accent";

export function Note({ tone = "info", children, className }: { tone?: "info" | "ok" | "warn" | "bad"; children: React.ReactNode; className?: string }) {
  const tones = {
    info: "border-line-strong bg-surface text-ink",
    ok: "border-ok-line bg-ok-bg text-ok-ink",
    warn: "border-warn-line bg-warn-bg text-warn-ink",
    bad: "border-bad-line bg-bad-bg text-bad-ink",
  };
  return (
    <div role={tone === "bad" ? "alert" : undefined} className={cn("rounded-xl border px-4 py-3 text-sm leading-relaxed", tones[tone], className)}>
      {children}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs leading-relaxed text-faint">{hint}</span>}
    </label>
  );
}
