"use client";

import { useState } from "react";
import { Bell, Search } from "lucide-react";

export interface TopNavProps {
  title: string;
  subtitle?: string;
  userName: string;
  userInitials: string;
  notificationCount?: number;
}

export function TopNav({
  title,
  subtitle,
  userName,
  userInitials,
  notificationCount = 0,
}: TopNavProps) {
  const [query, setQuery] = useState("");

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

        <button
          type="button"
          aria-label={
            notificationCount > 0
              ? `Notifications (${notificationCount} unread)`
              : "Notifications"
          }
          className="relative flex h-9 w-9 items-center justify-center rounded-md text-stone-600 transition-colors hover:bg-stone-50 hover:text-stone-900"
        >
          <Bell size={18} aria-hidden="true" />
          {notificationCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-coral-500 px-1 text-[10px] font-semibold text-white">
              {notificationCount > 9 ? "9+" : notificationCount}
            </span>
          )}
        </button>

        <div className="flex items-center gap-2.5 border-l border-stone-200 pl-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-aegean-500 text-xs font-bold text-white">
            {userInitials}
          </div>
          <span className="text-sm font-medium text-stone-900">{userName}</span>
        </div>
      </div>
    </header>
  );
}
