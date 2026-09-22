import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

import { ThemeToggle } from "@/components/ThemeToggle";
import { THEME_STORAGE_KEY } from "@/lib/theme";

// Runs before hydration so the class is already correct on first
// paint -- without this, the server always renders the "dark"
// fallback below and a stored "light" preference would flash dark
// before ThemeToggle's own effect corrects it on mount.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)});if(t==="light"){document.documentElement.classList.remove("dark")}else{document.documentElement.classList.add("dark")}}catch(e){document.documentElement.classList.add("dark")}})();`;

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
  title: "Vettr | Booking & Curation Engine",
  description: "Automated booking, curation, and scheduling engine for high-demand artists.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${generalSans.variable} h-full antialiased dark`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-[100dvh] w-full flex flex-col overflow-y-auto overscroll-bounce bg-background text-foreground font-sans">
        <div className="fixed top-3 right-3 z-50">
          <ThemeToggle />
        </div>
        {children}
      </body>
    </html>
  );
}