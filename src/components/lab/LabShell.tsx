"use client";

import {
  FolderGit2,
  House,
  Inbox,
  MessageCirclePlus,
  MessageCircleQuestionMark,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo, Wordmark } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

interface NavItem {
  path: string;
  label: string;
  short: string;
  icon: LucideIcon;
  phone: boolean; // in the tab bar on a phone; Settings sits in the top bar there
}

const NAV: NavItem[] = [
  { path: "", label: "Home", short: "Home", icon: House, phone: true },
  { path: "/ask", label: "Ask or add", short: "Ask", icon: MessageCirclePlus, phone: true },
  { path: "/open", label: "Open questions", short: "Open", icon: MessageCircleQuestionMark, phone: true },
  { path: "/people", label: "People", short: "People", icon: Users, phone: true },
  { path: "/code", label: "Code", short: "Code", icon: FolderGit2, phone: true },
  { path: "/review", label: "Review", short: "Review", icon: Inbox, phone: false }, // admins, while drafts wait
  { path: "/settings", label: "Settings", short: "Settings", icon: SlidersHorizontal, phone: false },
];

/** A label beside a rail icon on hover or focus, while the rail is icons only (as in Proxenos). */
function Tip({ children }: { children: React.ReactNode }) {
  return (
    <span
      role="presentation"
      className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg border border-line-strong bg-surface-2 px-2.5 py-1 text-xs text-ink opacity-0 shadow-pop transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 xl:hidden"
    >
      {children}
    </span>
  );
}

function Count({ n, className }: { n: number; className?: string }) {
  return (
    <span
      className={cn("num rounded-full bg-accent px-1.5 text-center text-[10px] font-medium leading-4 text-accent-ink", className)}
      aria-hidden="true"
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

interface ShellProps {
  slug: string;
  name: string;
  institution: string;
  open: number;
  review: number;
  personName: string;
  children: React.ReactNode;
}

/**
 * The frame of a lab's pages, as in Proxenos: a rail down the left (icons on a laptop, a sidebar
 * with labels on a wide screen), and on a phone a top bar and a tab bar.
 */
export function LabShell({ slug, name, institution, open, review, personName, children }: ShellProps) {
  const pathname = usePathname();
  const base = `/${slug}`;
  const isActive = (item: NavItem) =>
    item.path === ""
      ? pathname === base || pathname.startsWith(`${base}/c/`) || pathname.startsWith(`${base}/t/`)
      : pathname.startsWith(base + item.path);

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-16 flex-shrink-0 flex-col border-r border-line bg-surface/40 px-3 py-3 md:flex xl:w-60 xl:px-3.5 xl:py-4">
        <Link
          href="/"
          className="group relative mb-3 flex h-10 w-10 items-center justify-center rounded-xl hover:bg-surface-2 xl:h-11 xl:w-full xl:justify-start xl:gap-2.5 xl:px-2"
          aria-label="Thanos: all your labs"
        >
          <Logo size={26} className="flex-shrink-0 text-accent" />
          <Wordmark className="hidden text-[1.6rem] xl:inline" />
          <Tip>All your labs</Tip>
        </Link>
        <Link href="/" className="mb-4 hidden rounded-lg px-2.5 py-2 hover:bg-surface-2 xl:block" title="Switch lab">
          <span className="block truncate text-sm font-medium text-ink">{name}</span>
          <span className="block truncate text-xs text-faint">{institution || "Switch lab"}</span>
        </Link>
        <nav aria-label={name} className="flex min-h-0 flex-1 flex-col items-center xl:items-stretch">
          <ul className="flex flex-col items-center gap-1 xl:items-stretch">
            {NAV.filter((item) => item.path !== "/review" || review > 0).map((item) => {
              const active = isActive(item);
              const count = item.path === "/open" ? open : item.path === "/review" ? review : 0;
              return (
                <li key={item.path}>
                  <Link
                    href={base + item.path}
                    aria-current={active ? "page" : undefined}
                    aria-label={count ? `${item.label}, ${count}` : item.label}
                    className={cn(
                      "group relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors xl:h-9 xl:w-full xl:justify-start xl:gap-3 xl:rounded-lg xl:px-2.5",
                      active ? "bg-accent/10 text-accent" : "text-muted hover:bg-surface-2 hover:text-ink",
                    )}
                  >
                    {active && (
                      <span
                        className="absolute -left-3 top-2.5 bottom-2.5 w-[3px] rounded-r-full bg-accent xl:-left-3.5 xl:top-2 xl:bottom-2"
                        aria-hidden="true"
                      />
                    )}
                    <item.icon size={18} strokeWidth={2} className="flex-shrink-0" aria-hidden="true" />
                    <span className={cn("hidden min-w-0 flex-1 truncate text-sm xl:block", active && "text-ink")}>{item.label}</span>
                    {count > 0 && <Count n={count} className="absolute -right-1 -top-1 min-w-[16px] xl:static xl:min-w-[20px]" />}
                    <Tip>{item.label}</Tip>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-auto flex flex-col items-center gap-2 pt-3 xl:items-stretch">
            <ThemeToggle className="h-10 w-10 justify-center rounded-xl hover:bg-surface-2 xl:h-9 xl:w-full xl:justify-start xl:px-2.5" withLabel={false} />
            <span className="hidden truncate px-2.5 text-xs text-faint xl:block">Signed in as {personName}</span>
          </div>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center gap-2.5 border-b border-line bg-bg/90 px-4 py-2.5 backdrop-blur md:hidden">
          <Link href="/" className="flex min-w-0 items-center gap-2" aria-label="All your labs">
            <Logo size={22} className="flex-shrink-0 text-accent" />
            <span className="truncate text-sm font-medium">{name}</span>
          </Link>
          <div className="ml-auto flex items-center">
            <ThemeToggle className="rounded-lg p-2 hover:bg-surface-2" />
            <Link href={`${base}/settings`} aria-label="Settings" className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink">
              <SlidersHorizontal size={18} aria-hidden="true" />
            </Link>
          </div>
        </header>
        <main className="flex-1 px-4 pb-28 pt-6 md:px-10 md:pb-16 md:pt-12">
          <div className="mx-auto w-full max-w-3xl">{children}</div>
        </main>
      </div>

      <nav
        aria-label={`${name}, on a phone`}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="grid grid-cols-5">
          {NAV.filter((item) => item.phone).map((item) => {
            const active = isActive(item);
            const count = item.path === "/open" ? open : 0;
            return (
              <li key={item.path}>
                <Link
                  href={base + item.path}
                  aria-current={active ? "page" : undefined}
                  className={cn("relative flex flex-col items-center gap-0.5 py-2 text-[11px]", active ? "text-accent" : "text-muted")}
                >
                  <item.icon size={20} aria-hidden="true" />
                  {item.short}
                  {count > 0 && <Count n={count} className="absolute left-1/2 top-1 ml-1.5 min-w-[16px]" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
