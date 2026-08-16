import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import MSWProvider from "@/app/MSWProvider";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "VertexAI — Security Dashboard",
  description:
    "VertexAI human-supervised multi-agent cybersecurity platform. " +
    "Risk prioritization, deduplication, and HITL vulnerability management.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* MSWProvider activates Mock Service Worker in development only.
            Remove this wrapper at Integration Step 3 when pointing at the
            real Spring Boot backend (NEXT_PUBLIC_API_URL=http://localhost:8080). */}
        <MSWProvider>{children}</MSWProvider>
      </body>
    </html>
  );
}
