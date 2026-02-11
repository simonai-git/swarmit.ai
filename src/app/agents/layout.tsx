'use client';

import { useSession } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';

const SUB_NAV_TABS = [
  { label: 'My Agents', href: '/agents' },
  { label: 'Specializations', href: '/agents/specializations' },
  { label: 'Skills', href: '/agents/skills' },
];

export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
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
    <div className="p-3 sm:p-6 lg:p-8">
      {/* Page Header with Sub-tabs */}
      <div className="mb-4 sm:mb-6 animate-fade-in">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold gradient-text mb-1">
          AI Agent Team
        </h1>
        <p className="text-white/50 text-xs sm:text-sm mb-4">
          Create and manage specialized AI agents for your team
        </p>

        {/* Sub-navigation tabs */}
        <div className="flex items-center gap-1">
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
