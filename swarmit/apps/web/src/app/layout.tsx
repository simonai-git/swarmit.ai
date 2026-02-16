import type { Metadata } from 'next';
import './globals.css';
import { AppSidebar } from '@/components/AppSidebar';
import { Providers } from '@/components/Providers';
import { NotificationBell } from '@/components/NotificationBell';
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
          <div className="flex h-screen overflow-hidden">
            <AppSidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
              <header className="flex items-center justify-end px-6 py-2 border-b border-zinc-800 shrink-0">
                <NotificationBell />
              </header>
              <main className="flex-1 overflow-y-auto">{children}</main>
            </div>
          </div>
          <Toaster theme="dark" position="bottom-right" />
        </Providers>
      </body>
    </html>
  );
}
