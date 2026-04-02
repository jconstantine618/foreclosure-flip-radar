import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Foreclosure Flip Radar",
  description:
    "Track foreclosure properties, analyze flip opportunities, and manage your real estate investment pipeline.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
