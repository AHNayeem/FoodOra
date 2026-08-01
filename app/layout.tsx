import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { siteConfig } from "@/constants/site";
import { dirFor, type Locale } from "@/config/i18n/config";
import { Toaster } from "@/components/ui/toaster";
import { ThemeScript } from "@/components/ui/theme-script";
import { DemoEngine } from "@/components/demo/demo-engine";
import { DemoBar } from "@/components/demo/demo-bar";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} — ${siteConfig.tagline}`,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  keywords: [
    "food delivery",
    "restaurants",
    "cloud kitchen",
    "home chef",
    "catering",
    "table booking",
    "food ordering",
  ],
  openGraph: {
    type: "website",
    url: siteConfig.url,
    siteName: siteConfig.name,
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
  },
};

export const viewport: Viewport = {
  themeColor: "#f24822",
  width: "device-width",
  initialScale: 1,
};

/**
 * Root layout — owns the document shell (fonts, i18n provider, theme). The
 * marketing site chrome lives in the `(marketing)` group; the dashboard will
 * have its own shell, so surfaces stay decoupled.
 */
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = (await getLocale()) as Locale;
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      dir={dirFor(locale)}
      className={`${jakarta.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body
        className="flex min-h-full flex-col bg-surface text-ink antialiased"
        suppressHydrationWarning
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
          <Toaster />
          {/* Prototype aids: the autopilot that plays the actors the presenter
              is not, and the strip that controls it. Both render nothing into
              the product's own layout. */}
          <DemoEngine />
          <DemoBar />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
