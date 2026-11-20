import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Fraunces, Geist, Geist_Mono, Hind_Siliguri } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const display = Bricolage_Grotesque({ variable: "--font-display", subsets: ["latin"], weight: ["600", "800"] });
const bangla = Hind_Siliguri({ variable: "--font-bangla", subsets: ["bengali"], weight: ["400", "600"] });
/** Chunky soft serif for the bright guest screens (/invite, /play). */
const party = Fraunces({ variable: "--font-party", subsets: ["latin"], axes: ["SOFT", "WONK"] });

export const metadata: Metadata = {
  title: { default: "The Birthday Files: Mez Edition", template: "%s · The Birthday Files" },
  description: "An interactive, AI-hosted birthday game show. 21 November 2026.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0a0818",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} ${bangla.variable} ${party.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
