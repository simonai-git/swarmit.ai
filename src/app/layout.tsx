import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import AppLayout from "@/components/AppLayout";

export const metadata: Metadata = {
  title: "Swarm It",
  description: "AI Agentic Autonomous Project Factory",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>
          <AppLayout>{children}</AppLayout>
        </Providers>
      </body>
    </html>
  );
}
