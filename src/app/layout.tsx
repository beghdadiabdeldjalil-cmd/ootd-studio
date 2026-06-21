import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OOTD Studio — AI Outfit Coordination for Women",
  description:
    "Paste any Amazon fashion piece and get a complete coordinating outfit — matched accessories, OOTD collage, and direct Amazon links.",
  keywords: ["OOTD", "outfit of the day", "Amazon", "outfit", "AI", "fashion", "coordination", "matching", "women"],
  openGraph: {
    title: "OOTD Studio — AI Outfit Coordination",
    description:
      "Your perfect outfit, styled and matched. Paste any fashion piece and get a full coordinating look.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "OOTD Studio — AI Outfit Coordination",
    description:
      "Your perfect outfit, styled and matched. Paste any fashion piece and get a full coordinating look.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${fraunces.variable} antialiased bg-background text-foreground`}
        suppressHydrationWarning
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
