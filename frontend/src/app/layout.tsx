import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import MSWProvider from "@/app/MSWProvider";
import { PipelineProvider } from "@/lib/pipeline-context";

// Technical SOC Typography: IBM Plex Sans (UI & Headings) + IBM Plex Mono (Data & CVEs)
const ibmPlexSans = IBM_Plex_Sans({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "VertexAI · SOC Dashboard",
  description:
    "VertexAI human-supervised multi-agent cybersecurity platform. " +
    "Risk prioritization, deduplication, and HITL vulnerability management.",
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} bg-background`}
    >
      <body className="antialiased font-sans font-normal text-slate-800">
        <MSWProvider>
          {/* Pipeline state is hoisted to the root layout so it survives route changes.
              Without this, uploading on /uploads could not update the Threat Overview
              on /dashboard until the user manually switched tabs. */}
          <PipelineProvider>
            {children}
          </PipelineProvider>
        </MSWProvider>
      </body>
    </html>
  );
}
