import "./globals.css";

const siteName = "Unified Flow";
const siteDescription =
  "Unified Flow is a Solana token vesting and distribution protocol for linear, cliff, and milestone-based streams with an indexer, dashboard, CLI, and MCP tools.";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";


export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className="font-sans"
      style={{
        ["--font-sans" as any]: "ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function (registrations) {
                  return Promise.all(registrations.map(function (registration) {
                    return registration.unregister();
                  }));
                }).catch(function () {});
              }
              if ('caches' in window) {
                caches.keys().then(function (keys) {
                  return Promise.all(keys.map(function (key) {
                    return caches.delete(key);
                  }));
                }).catch(function () {});
              }
            `,
          }}
        />
        <title>{siteName}</title>
        <meta name="description" content={siteDescription} />
        <meta name="keywords" content="solana vesting, token distribution, cliff vesting, milestone vesting, linear vesting, anchor, mcp, cli" />
        <link rel="canonical" href={siteUrl} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={siteName} />
        <meta property="og:title" content={siteName} />
        <meta property="og:description" content={siteDescription} />
        <meta property="og:url" content={siteUrl} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={siteName} />
        <meta name="twitter:description" content={siteDescription} />
        <meta name="application-name" content="Mancer Flow" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#0b1120" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/icon-192.svg" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
