import Link from "next/link";

import { Logo, Wordmark } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

/** The pages outside a lab (signing in, joining, the list of your labs): the name, and a column. */
export function Frame({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-5 py-4 md:px-8">
        <Link href="/" className="flex items-center gap-2.5 rounded-lg" aria-label="Thanos: home">
          <Logo size={26} className="text-accent" />
          <Wordmark className="text-[1.6rem]" />
        </Link>
        <ThemeToggle className="rounded-lg p-2 hover:bg-surface-2" />
      </header>
      <main className={cn("screen-in mx-auto w-full flex-1 px-5 pb-16 pt-8 md:pt-14", wide ? "max-w-3xl" : "max-w-md")}>{children}</main>
    </div>
  );
}

/** One value of a search parameter, whatever Next.js was given. */
export function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
