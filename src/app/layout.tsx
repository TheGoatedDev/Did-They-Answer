import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { LastSynced } from "@/components/last-synced";
import "./globals.css";

const sans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const serif = Newsreader({ variable: "--font-serif", subsets: ["latin"] });

export const metadata: Metadata = {
  // og:image needs an absolute URL; without this Next falls back to localhost.
  metadataBase: process.env.SITE_URL
    ? new URL(process.env.SITE_URL)
    : undefined,
  title: { default: "Did They Answer?", template: "%s · Did They Answer?" },
  description:
    "How thoroughly does the UK government engage with the petitions it answers? An automated, published assessment of every government response.",
};

const nav = [
  { href: "/", label: "Petitions" },
  { href: "/compare", label: "Compare" },
  { href: "/methodology", label: "Methodology" },
] as const;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-GB"
      className={`${sans.variable} ${mono.variable} ${serif.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-10 focus:rounded focus:bg-background focus:px-3 focus:py-2 focus:ring-2 focus:ring-ring"
        >
          Skip to content
        </a>
        <header className="border-b-4 border-foreground">
          <div className="mx-auto flex max-w-6xl flex-wrap items-baseline justify-between gap-x-8 gap-y-2 px-4 py-4">
            <Link
              href="/"
              className="font-heading text-2xl font-semibold tracking-tight"
            >
              Did They Answer?
            </Link>
            <nav aria-label="Main">
              <ul className="flex gap-6 text-sm font-medium">
                {nav.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="underline-offset-4 hover:underline"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
          {children}
        </main>
        <footer className="border-t text-sm text-muted-foreground">
          <div className="mx-auto grid max-w-6xl gap-2 px-4 py-6">
            <p>
              Assessments are automated, made by a decision model against a{" "}
              <Link
                href="/methodology"
                className="underline underline-offset-4"
              >
                published rubric
              </Link>
              . They describe how a response engages with a petition, not the
              intent behind it.
            </p>
            <p>
              Contains Parliamentary information licensed under the{" "}
              <a
                className="underline underline-offset-4"
                href="https://www.parliament.uk/site-information/copyright-parliament/open-parliament-licence/"
              >
                Open Parliament Licence v3.0
              </a>
              . Code on{" "}
              <a
                className="underline underline-offset-4"
                href="https://github.com/TheGoatedDev/did-they-answer"
              >
                GitHub
              </a>
              .
            </p>
            <Suspense fallback={null}>
              <LastSynced />
            </Suspense>
          </div>
        </footer>
      </body>
    </html>
  );
}
