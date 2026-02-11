'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import AppSidebar from './AppSidebar';

const STORAGE_KEY = 'sidebar-collapsed';

function getInitialCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(getInitialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  };

  // Hide sidebar on login page
  const hideSidebar = pathname === '/login';

  if (hideSidebar) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen">
      <AppSidebar
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-3 left-3 z-30 md:hidden p-2 rounded-xl bg-[#0f0f1a]/80 backdrop-blur-sm border border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition-all"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Main content area */}
      <main
        className={`transition-all duration-300 ${
          collapsed ? 'md:ml-16' : 'md:ml-60'
        }`}
      >
        {children}
      </main>
    </div>
  );
}
