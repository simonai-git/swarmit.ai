'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { User, BarChart3, Key, Plug } from 'lucide-react';

const menuItems = [
  { href: '/profile', label: 'General', icon: User },
  { href: '/profile/usage', label: 'Usage & Metrics', icon: BarChart3 },
  { href: '/profile/api-keys', label: 'API Keys', icon: Key },
  { href: '/profile/integrations', label: 'Integrations', icon: Plug },
];

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="p-3 sm:p-6 lg:p-8">
      {/* Page Title */}
      <div className="mb-4 sm:mb-6 animate-fade-in">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold gradient-text mb-1">
          Profile Settings
        </h1>
        <p className="text-white/50 text-xs sm:text-sm mb-4">
          Manage your account, usage, and integrations
        </p>

        {/* Horizontal tabs */}
        <div className="flex items-center gap-1 flex-wrap">
          {menuItems.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== '/profile' && pathname?.startsWith(item.href));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-white border border-blue-500/30'
                    : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Main content */}
      <div>
        {children}
      </div>
    </div>
  );
}
