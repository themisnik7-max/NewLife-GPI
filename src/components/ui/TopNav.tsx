"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, Search } from "lucide-react";
import type { NotificationEntry } from "@/lib/data/notifications";

export interface TopNavProps {
  title: string;
  subtitle?: string;
  userName: string;
  userInitials: string;
  notifications?: NotificationEntry[];
  onMarkNotificationRead?: (notificationId: string) => void;
}

const notificationDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function TopNav({
  title,
  subtitle,
  userName,
  userInitials,
  notifications = [],
  onMarkNotificationRead,
}: TopNavProps) {
  const [query, setQuery] = useState("");
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const unreadCount = notifications.filter((notification) => !notification.read).length;

  return (
    <header className="flex items-center justify-between gap-6 border-b border-stone-200 bg-stone-0 px-8 py-4">
      <div>
        <h1 className="font-display text-lg font-bold text-stone-900">{title}</h1>
        {subtitle && <p className="text-sm text-stone-600">{subtitle}</p>}
      </div>

      <div className="flex flex-1 items-center justify-end gap-4">
        <label className="relative w-full max-w-xs">
          <span className="sr-only">Search</span>
          <Search
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
          />
          <input
            type="text"
            placeholder="Search clients, properties…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-md border border-stone-300 bg-stone-0 py-2 pl-9 pr-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-aegean-500 focus:outline-none focus:ring-2 focus:ring-aegean-100"
          />
        </label>

        <div className="relative">
          <button
            type="button"
            aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"}
            aria-expanded={isNotificationsOpen}
            onClick={() => setIsNotificationsOpen((open) => !open)}
            className="relative flex h-9 w-9 items-center justify-center rounded-md text-stone-600 transition-colors hover:bg-stone-50 hover:text-stone-900"
          >
            <Bell size={18} aria-hidden="true" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-coral-500 px-1 text-[10px] font-semibold text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {isNotificationsOpen && (
            <div className="absolute right-0 top-11 z-10 w-80 rounded-md border border-stone-200 bg-stone-0 shadow-lg">
              {notifications.length === 0 ? (
                <p className="p-4 text-sm text-stone-500">No notifications yet.</p>
              ) : (
                <ul className="max-h-80 overflow-y-auto">
                  {notifications.map((notification) => (
                    <li
                      key={notification.id}
                      className={`border-b border-stone-100 p-3 text-sm last:border-0 ${
                        notification.read ? "text-stone-500" : "bg-aegean-50/50 font-medium text-stone-900"
                      }`}
                    >
                      <p>{notification.message}</p>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="text-xs font-normal text-stone-400">
                          {notificationDateFormatter.format(new Date(notification.createdAt))}
                        </span>
                        {!notification.read && (
                          <button
                            type="button"
                            onClick={() => onMarkNotificationRead?.(notification.id)}
                            className="text-xs font-semibold text-aegean-600 hover:underline"
                          >
                            Mark as read
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <Link
          href="/settings"
          className="flex items-center gap-2.5 border-l border-stone-200 pl-4 transition-colors hover:text-aegean-700"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-aegean-500 text-xs font-bold text-white">
            {userInitials}
          </div>
          <span className="text-sm font-medium text-stone-900">{userName}</span>
        </Link>
      </div>
    </header>
  );
}
