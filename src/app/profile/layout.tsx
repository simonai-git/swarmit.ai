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
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-4">
              <Link href="/" className="text-xl font-bold text-white">
                Swarm It
              </Link>
              <span className="text-gray-400">/</span>
              <span className="text-gray-300">Profile Settings</span>
            </div>
            <Link 
              href="/"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 min-h-[calc(100vh-56px)] bg-gray-800 border-r border-gray-700">
          <nav className="p-4 space-y-1">
            {menuItems.map((item) => {
              const isActive = pathname === item.href || 
                (item.href !== '/profile' && pathname?.startsWith(item.href));
              const Icon = item.icon;
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
