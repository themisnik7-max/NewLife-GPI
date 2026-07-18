import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NewLife GPI",
  description: "Autonomous AI Secretary OS",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-stone-25 font-body text-stone-900">{children}</body>
    </html>
  );
}
