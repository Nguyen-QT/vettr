import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { headers } from "next/headers";
import "./globals.css";

import { NONCE_REQUEST_HEADER } from "@/lib/contentSecurityPolicy";
import { THEME_STORAGE_KEY } from "@/lib/theme";

// Runs before hydration so the class is already correct on first
// paint. The server can't read localStorage, so it always renders
// light (no "dark" class below); this adds "dark" only when that is
// the stored choice. Anything else, including storage throwing,
// stays light.
const THEME_INIT_SCRIPT = `(function(){try{if(localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)})==="dark"){document.documentElement.classList.add("dark")}}catch(e){}})();`;

const generalSans = localFont({
  src: [
    {
      path: "../../public/fonts/GeneralSans-Light.woff2",
      weight: "300",
      style: "normal",
    },
    {
      path: "../../public/fonts/GeneralSans-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/GeneralSans-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../public/fonts/GeneralSans-Semibold.woff2",
      weight: "600",
      style: "normal",
    },
  ],
  variable: "--font-sans",
  display: "swap",
});

// 2. Lock Mobile Viewport for Native iOS / PWA Feel
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover", // Extends background beneath the notch & home bar
};

// 3. Metadata Configuration
export const metadata: Metadata = {
  // Resolves relative canonical URLs (e.g. `/@handle`). The fallback
  // matches createConnectOnboardingLink and playwright.config.ts baseURL.
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: "Vettr | Booking & Curation Engine",
  description: "Automated booking, curation, and scheduling engine for high-demand artists.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The proxy's per-request nonce (53.4.3.2); Next nonces its own scripts from
  // the CSP request header, so only the theme script needs it here. Reading
  // headers() makes every route dynamic, which a nonce needs. A route the
  // proxy skips has no x-nonce, and no CSP either.
  const nonce = (await headers()).get(NONCE_REQUEST_HEADER) ?? undefined;

  return (
    <html
      lang="en"
      className={`${generalSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Browsers hide `nonce` after parsing, so hydration would see a
            mismatch; next-themes suppresses it the same way. */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
      </head>
      <body className="min-h-[100dvh] w-full flex flex-col overflow-y-auto overscroll-bounce bg-background text-foreground font-sans">
        {children}
      </body>
    </html>
  );
}