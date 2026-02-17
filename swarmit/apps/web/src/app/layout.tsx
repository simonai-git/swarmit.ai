import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';
import { LayoutShell } from '@/components/LayoutShell';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
  title: 'Swarmit.ai',
  description: 'AI Agent Orchestration Platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground font-sans antialiased">
        <Providers>
          <LayoutShell>{children}</LayoutShell>
          <Toaster theme="dark" position="bottom-right" />
        </Providers>
      </body>
    </html>
  );
}
