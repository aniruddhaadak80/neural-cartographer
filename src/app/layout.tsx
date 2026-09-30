import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Neural Cartographer — survey a codebase, factor by factor",
  description:
    "A deterministic, explainable code-intelligence atlas. Survey a codebase across six weighted factors, drill into per-file metrics, and export the result. Ships with an MCP tool server so agents can call the same engine.",
  keywords: [
    "code quality",
    "static analysis",
    "code intelligence",
    "MCP",
    "model context protocol",
  ],
  authors: [{ name: "aniruddhaadak80" }],
  openGraph: {
    title: "Neural Cartographer",
    description:
      "An explainable code-intelligence atlas with a deterministic scoring engine and an MCP tool server.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#f5ede0",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="paper-texture min-h-screen bg-paper text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
