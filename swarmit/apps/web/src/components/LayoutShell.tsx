'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { AppSidebar } from '@/components/AppSidebar';
import { NotificationBell } from '@/components/NotificationBell';

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-4 md:px-6 py-2 border-b border-zinc-800 shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="md:hidden p-1 text-zinc-400 hover:text-white transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="md:hidden" />
          <NotificationBell />
        </header>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
