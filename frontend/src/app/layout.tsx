import "./globals.css";

import {
  Providers,
} from "@/components/wallet/provider";
import { PwaRegister } from "@/components/pwa/pwa-register";


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
        <meta name="application-name" content="Mancer Flow" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#0b1120" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/icon-192.svg" />
      </head>
      <body>
        <Providers>
          <PwaRegister />
          {children}
        </Providers>
      </body>
    </html>
  );
}
