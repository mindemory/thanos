import type { Metadata, Viewport } from "next";
import { EB_Garamond, Geist, Geist_Mono, Newsreader } from "next/font/google";

import { ToastProvider } from "@/components/Toasts";

import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const display = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  axes: ["opsz"],
  style: ["normal", "italic"],
});
const brand = EB_Garamond({ subsets: ["latin"], variable: "--font-garamond" });

export const metadata: Metadata = {
  title: { default: "Thanos", template: "%s · Thanos" },
  description: "A lab's memory: what everyone in it has worked out, searchable, and still there after they move on.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#111111" };

// Runs before the page paints, so someone who chose the light theme never sees a dark flash.
const THEME = `try{if(localStorage.getItem("thanos.theme")==="light")document.documentElement.dataset.theme="light"}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable} ${display.variable} ${brand.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME }} />
      </head>
      <body className="bg-bg font-sans text-ink antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
