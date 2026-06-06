import "./globals.css";
import { Providers } from "@/components/wallet/provider";
import { PwaRegister } from "@/components/pwa/pwa-register";
import { OnboardingProvider } from "@/components/onboarding/onboarding-provider";
import { WalletUserSync } from "@/components/wallet/wallet-user-sync";
import { NotificationToastStack } from "@/components/dashboard/notification-banner";
import type { CSSProperties, ReactNode } from "react";

const htmlStyle = {
  "--font-sans": "ui-sans-serif, system-ui, sans-serif",
} as CSSProperties;

const siteName = "Unified Flow";
const siteDescription =
  "Unified Flow is a Solana token vesting and distribution protocol for linear, cliff, and milestone-based streams with an indexer, dashboard, CLI, and MCP tools.";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const siteImage = new URL("/logo-512.png", siteUrl).toString();

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html
      lang="en"
      className="font-sans"
      suppressHydrationWarning
      style={htmlStyle}
    >
      <head>
        <title>{siteName}</title>
        <meta name="description" content={siteDescription} />
        <meta name="keywords" content="solana vesting, token distribution, cliff vesting, milestone vesting, linear vesting, anchor, mcp, cli" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={siteName} />
        <meta property="og:title" content={siteName} />
        <meta property="og:description" content={siteDescription} />
        <meta property="og:url" content={siteUrl} />
        <meta property="og:image" content={siteImage} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={siteName} />
        <meta name="twitter:description" content={siteDescription} />
        <meta name="twitter:image" content={siteImage} />
        <meta name="application-name" content="Unified Flow" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#0b1120" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" type="image/png" sizes="192x192" href="/logo-192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/logo-512.png" />
        <link rel="shortcut icon" href="/logo-192.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/logo-192.png" />
      </head>
      <body>
        <PwaRegister />
        <Providers>
          <WalletUserSync />
          <NotificationToastStack className="top-20" />
          <OnboardingProvider>{children}</OnboardingProvider>
        </Providers>
      </body>
    </html>
  );
}
