'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import {
  LayoutDashboard,
  FolderOpen,
  Bot,
  GitBranch,
  Play,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  User,
} from 'lucide-react';

interface AppSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

const navItems = [
  { icon: LayoutDashboard, label: 'Tasks', path: '/' },
  { icon: FolderOpen, label: 'Projects', path: '/projects' },
  { icon: Bot, label: 'Agents', path: '/agents' },
  { icon: GitBranch, label: 'Workflows', path: '/workflows' },
  { icon: Play, label: 'Runs', path: '/runs' },
  { icon: BarChart3, label: 'Dashboard', path: '/dashboard' },
  { icon: Settings, label: 'Settings', path: '/settings' },
];

export default function AppSidebar({ collapsed, onToggleCollapse, mobileOpen, onMobileClose }: AppSidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/';
    return pathname.startsWith(path);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-white/10 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          S
        </div>
        {!collapsed && (
          <span className="text-white font-semibold text-lg whitespace-nowrap">Swarm It</span>
        )}
      </div>

      {/* Nav Items */}
      <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const active = isActive(item.path);
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              href={item.path}
              onClick={onMobileClose}
              title={collapsed ? item.label : undefined}
              className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all relative ${
                active
                  ? 'bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-white border-l-2 border-blue-400'
                  : 'text-white/60 hover:text-white hover:bg-white/5 border-l-2 border-transparent'
              } ${collapsed ? 'justify-center' : ''}`}
            >
              <Icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-blue-400' : 'text-white/50 group-hover:text-white/80'}`} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom Section: User + Collapse Toggle */}
      <div className="border-t border-white/10 p-2 flex-shrink-0">
        {/* User */}
        {session && (
          <Link
            href="/profile"
            onClick={onMobileClose}
            title={collapsed ? session.user?.name || 'Profile' : undefined}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all hover:bg-white/5 ${
              isActive('/profile') ? 'bg-white/5 text-white' : 'text-white/60 hover:text-white'
            } ${collapsed ? 'justify-center' : ''}`}
          >
            {session.user?.image ? (
              <img src={session.user.image} alt="" className="w-7 h-7 rounded-full flex-shrink-0" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                {session.user?.name?.[0] || session.user?.email?.[0] || '?'}
              </div>
            )}
            {!collapsed && (
              <span className="truncate">{session.user?.name || session.user?.email || 'User'}</span>
            )}
          </Link>
        )}

        {/* Sign Out */}
        <button
          onClick={() => signOut()}
          title={collapsed ? 'Sign out' : undefined}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/40 hover:text-red-400 hover:bg-white/5 transition-all w-full ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>

        {/* Collapse Toggle (desktop only) */}
        <button
          onClick={onToggleCollapse}
          className="hidden md:flex items-center justify-center w-full mt-1 px-3 py-2 rounded-xl text-white/30 hover:text-white/60 hover:bg-white/5 transition-all"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full z-50 bg-[#0f0f1a]/95 backdrop-blur-xl border-r border-white/10 transition-all duration-300 ${
          // Mobile: slide in/out
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0 ${
          // Desktop: collapsed or expanded width
          collapsed ? 'md:w-16' : 'md:w-60'
        } w-60`}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
