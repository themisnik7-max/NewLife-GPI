"use client";

import {
  Home,
  HardHat,
  Stamp,
  Wallet,
  KeyRound,
  User,
  LogOut,
  type LucideIcon,
} from "lucide-react";

export interface SidebarNavItem {
  key: string;
  label: string;
  icon: LucideIcon;
}

export const SIDEBAR_NAV_ITEMS: SidebarNavItem[] = [
  { key: "overview", label: "Overview", icon: Home },
  { key: "construction", label: "Construction", icon: HardHat },
  { key: "visa", label: "Golden Visa", icon: Stamp },
  { key: "payments", label: "Payments & expenses", icon: Wallet },
  { key: "rental", label: "Rental & taxes", icon: KeyRound },
  { key: "profile", label: "Personal info", icon: User },
];

export interface SidebarClient {
  initials: string;
  name: string;
  property: string;
}

export interface SidebarProps {
  activeKey: string;
  client: SidebarClient;
  onNavigate?: (key: string) => void;
  onLogout?: () => void;
}

export function Sidebar({ activeKey, client, onNavigate, onLogout }: SidebarProps) {
  return (
    <nav
      aria-label="Primary"
      className="flex h-full w-60 shrink-0 flex-col bg-flag-800 p-4"
    >
      <div className="px-2 pb-7 font-display text-xl font-extrabold text-white">
        NewLife GPI
      </div>

      <ul className="flex flex-1 flex-col gap-1">
        {SIDEBAR_NAV_ITEMS.map((item) => {
          const isActive = item.key === activeKey;
          const Icon = item.icon;
          return (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => onNavigate?.(item.key)}
                aria-current={isActive ? "page" : undefined}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-white/10 text-white"
                    : "text-aegean-200 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon size={18} aria-hidden="true" />
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-2.5 border-t border-white/10 pt-4">
        <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-aegean-400 text-[13px] font-bold text-white">
          {client.initials}
        </div>
        <div className="flex-1 text-[13px] font-semibold leading-tight text-white">
          {client.name}
          <div className="text-[11px] font-normal text-aegean-200">
            {client.property}
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          aria-label="Log out"
          className="flex h-8 w-8 items-center justify-center rounded-md text-aegean-200 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogOut size={16} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
