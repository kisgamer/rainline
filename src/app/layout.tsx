import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rainline — Know when the rain is coming",
  description:
    "A clearer view of precipitation, probability, and forecast predictability.",
  applicationName: "Rainline",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Rainline",
  },
  icons: { icon: "/icon.svg", apple: "/apple-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#081521",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
