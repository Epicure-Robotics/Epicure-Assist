import "@/app/globals.css";
import { Analytics } from "@vercel/analytics/react";
import type { Metadata } from "next";
import Script from "next/script";
import { ThemeProvider } from "@/components/themeProvider";

export const metadata: Metadata = {
  title: "Helper",
  description: "AI powered assistant",
  manifest: "/app.webmanifest",
  icons: [
    {
      rel: "icon",
      type: "image/x-icon",
      url: "/favicon.ico",
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full">
      <head>
        {process.env.NODE_ENV === "development" && (
          <>
            <Script
              src="//unpkg.com/react-grab/dist/index.global.js"
              strategy="beforeInteractive"
            />
            <Script
              src="//unpkg.com/@react-grab/cursor/dist/client.global.js"
              strategy="lazyOnload"
            />
          </>
        )}
      </head>
      <body className="h-full antialiased text-foreground bg-background" suppressHydrationWarning>
        <ThemeProvider attribute="class" forcedTheme="light">
          {children}
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
