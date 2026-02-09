'use client';

import { useSession } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';

const SUB_NAV_TABS = [
  { label: 'My Agents', href: '/agents' },
  { label: 'Specializations', href: '/agents/specializations' },
  { label: 'Skills', href: '/agents/skills' },
];

export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <span className="text-white/60">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="glass rounded-2xl p-4 sm:p-6 mb-4 sm:mb-8 animate-fade-in">
        {/* Row 1: Title left, User info right */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold gradient-text truncate">
              AI Agent Team
            </h1>
            <p className="text-white/50 text-xs sm:text-sm hidden md:block">
              Create and manage specialized AI agents for your team
            </p>
          </div>
          {session && <UserMenu session={session} />}
        </div>

        {/* Row 2: Navigation links */}
        <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-white/10">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="group flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 bg-white/10 text-white rounded-lg sm:rounded-xl font-medium hover:bg-white/20 hover:scale-105 active:scale-95 text-xs sm:text-sm transition-all border border-white/10"
            >
              <span className="text-base sm:text-lg">📋</span>
              <span className="hidden sm:inline">Tasks</span>
            </Link>
            <Link
              href="/projects"
              className="group flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 bg-white/10 text-white rounded-lg sm:rounded-xl font-medium hover:bg-white/20 hover:scale-105 active:scale-95 text-xs sm:text-sm transition-all border border-white/10"
            >
              <span className="text-base sm:text-lg">📁</span>
              <span className="hidden sm:inline">Projects</span>
            </Link>
          </div>
        </div>

        {/* Sub-navigation tabs */}
        <div className="flex items-center gap-1 mt-3 pt-3 border-t border-white/5">
          {SUB_NAV_TABS.map((tab) => {
            const isActive = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-white border border-blue-500/30'
                    : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>

      {children}
    </div>
  );
}
