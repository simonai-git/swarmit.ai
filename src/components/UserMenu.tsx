'use client';

import { useState, useRef, useEffect } from 'react';
import { signOut } from 'next-auth/react';
import { Session } from 'next-auth';

interface UserMenuProps {
  session: Session;
}

export default function UserMenu({ session }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const menuItems = [
    { label: 'Profile', href: '/profile', icon: '👤' },
    { label: 'API Keys', href: '/profile/api-keys', icon: '🔑' },
    { label: 'Integrations', href: '/profile/integrations', icon: '🔗' },
    { label: 'Usage', href: '/profile/usage', icon: '📊' },
  ];

  return (
    <div className="relative" ref={menuRef}>
      {/* Avatar button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-white/20 rounded-full"
      >
        {session.user?.image ? (
          <img
            src={session.user.image}
            alt=""
            className="w-8 h-8 rounded-full ring-2 ring-white/10 hover:ring-white/30 transition-all"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-medium ring-2 ring-white/10 hover:ring-white/30 transition-all">
            {session.user?.name?.[0] || session.user?.email?.[0] || '?'}
          </div>
        )}
        <svg
          className={`w-4 h-4 text-white/50 transition-transform hidden sm:block ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-xl bg-[#1a1a2e]/95 backdrop-blur-xl border border-white/10 shadow-xl shadow-black/50 py-2 z-[100] animate-fade-in">
          {/* User info header */}
          <div className="px-4 py-3 border-b border-white/10">
            <p className="text-white text-sm font-medium truncate">
              {session.user?.name || 'User'}
            </p>
            <p className="text-white/50 text-xs truncate">
              {session.user?.email}
            </p>
          </div>

          {/* Menu items */}
          <div className="py-2">
            {menuItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-4 py-2.5 text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <span className="text-base">{item.icon}</span>
                <span className="text-sm">{item.label}</span>
              </a>
            ))}
          </div>

          {/* Sign out */}
          <div className="border-t border-white/10 pt-2">
            <button
              onClick={() => signOut()}
              className="flex items-center gap-3 px-4 py-2.5 text-red-400/70 hover:text-red-400 hover:bg-white/5 transition-colors w-full"
            >
              <span className="text-base">🚪</span>
              <span className="text-sm">Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
