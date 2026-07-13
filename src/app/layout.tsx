import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Mon budget", template: "%s · Mon budget" },
  description: "Votre budget personnel, simplement.",
  applicationName: "Mon budget",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Mon budget" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#f5f3ee", colorScheme: "light" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body>{children}</body></html>;
}
