'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Bell, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, type Notification } from '@/lib/api';
import { useNotifications } from '@/hooks/useSocket';

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fetch unread count
  useEffect(() => {
    api.notifications.unreadCount().then(d => setUnreadCount(d.count)).catch(() => {});
  }, []);

  // Listen for new notifications
  const handleNew = useCallback((data: { type: string; title: string; message: string }) => {
    setUnreadCount(c => c + 1);
    toast(data.title, { description: data.message });
  }, []);
  useNotifications(handleNew);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const toggleOpen = async () => {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen) {
      setLoading(true);
      try {
        const data = await api.notifications.list({ limit: 10 });
        setNotifications(data.notifications);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
  };

  const markAsRead = async (id: string) => {
    await api.notifications.markAsRead(id).catch(() => {});
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    setUnreadCount(c => Math.max(0, c - 1));
  };

  const markAllAsRead = async () => {
    await api.notifications.markAllAsRead().catch(() => {});
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    setUnreadCount(0);
  };

  const deleteNotification = async (id: string) => {
    const n = notifications.find(n => n.id === id);
    await api.notifications.delete(id).catch(() => {});
    setNotifications(prev => prev.filter(n => n.id !== id));
    if (n && !n.isRead) setUnreadCount(c => Math.max(0, c - 1));
  };

  const clearAll = async () => {
    await api.notifications.deleteAll().catch(() => {});
    setNotifications([]);
    setUnreadCount(0);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggleOpen}
        className="relative p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        title="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-blue-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
          <div className="flex items-center justify-between p-3 border-b border-zinc-800">
            <span className="text-sm font-medium text-white">Notifications</span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Mark all as read
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="p-4 text-center text-zinc-500 text-sm">Loading...</div>
          ) : notifications.length === 0 ? (
            <div className="p-4 text-center text-zinc-500 text-sm">No notifications</div>
          ) : (
            notifications.map(n => (
              <div
                key={n.id}
                className={`group w-full text-left p-3 border-b border-zinc-800 hover:bg-zinc-800/50 transition-colors ${
                  n.isRead ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-start gap-2">
                  {!n.isRead && <span className="mt-1.5 w-2 h-2 bg-blue-500 rounded-full shrink-0" />}
                  <button
                    onClick={() => !n.isRead && markAsRead(n.id)}
                    className={`flex-1 text-left min-w-0 ${!n.isRead ? '' : 'ml-4'}`}
                  >
                    <p className="text-sm text-white leading-tight">{n.title}</p>
                    <p className="text-xs text-zinc-400 mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-xs text-zinc-600 mt-1">
                      {new Date(n.createdAt).toLocaleString()}
                    </p>
                  </button>
                  <button
                    onClick={() => deleteNotification(n.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-red-400 transition-all shrink-0"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
