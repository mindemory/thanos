/**
 * The mark: growth rings around an off-centre core, as a tree's are. Each year of a lab adds
 * one; the core is where it began. Drawn inline so it takes `currentColor` and needs no asset.
 */
export function Logo({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden="true" fill="none">
      <circle cx="16" cy="16" r="13.5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.35" />
      <circle cx="14.9" cy="15.2" r="9.2" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.6" />
      <circle cx="14.1" cy="14.6" r="5.2" stroke="currentColor" strokeWidth="1.6" strokeOpacity="0.85" />
      <circle cx="13.6" cy="14.25" r="2" fill="currentColor" />
    </svg>
  );
}

/** The name, set in the classical face. */
export function Wordmark({ className = "" }: { className?: string }) {
  return <span className={`font-brand leading-none tracking-[0.01em] text-ink ${className}`}>Thanos</span>;
}
