"use client";

import Link from "next/link";
import {
  Home,
  HardHat,
  Stamp,
  Wallet,
  KeyRound,
  User,
  Users,
  Building2,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";
import { UserButton } from "@clerk/nextjs";

export interface SidebarNavItem {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Rendered only when Sidebar is given `isAdmin`. */
  adminOnly?: boolean;
}

export const SIDEBAR_NAV_ITEMS: SidebarNavItem[] = [
  { key: "overview", label: "Overview", href: "/dashboard", icon: Home },
  { key: "property", label: "My Property", href: "/dashboard/property", icon: Building2 },
  { key: "construction", label: "Construction", href: "/dashboard/construction", icon: HardHat },
  { key: "visa", label: "Golden Visa", href: "/dashboard/visa", icon: Stamp },
  { key: "payments", label: "Payments & expenses", href: "/dashboard/payments", icon: Wallet },
  { key: "rental", label: "Rental & taxes", href: "/dashboard/rental", icon: KeyRound },
  { key: "projects", label: "Available Projects", href: "/dashboard/projects", icon: LayoutGrid },
  { key: "team", label: "Team", href: "/dashboard/team", icon: Users, adminOnly: true },
  { key: "profile", label: "Personal info", href: "/settings", icon: User },
];

export interface SidebarClient {
  property: string;
}

export interface SidebarProps {
  activeKey: string;
  client: SidebarClient;
  isAdmin?: boolean;
}

export function Sidebar({ activeKey, client, isAdmin = false }: SidebarProps) {
  const visibleNavItems = SIDEBAR_NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  return (
    <nav
      aria-label="Primary"
      className="flex h-full w-60 shrink-0 flex-col bg-flag-800 p-4"
    >
      <div className="px-2 pb-7 font-display text-xl font-extrabold text-white">
        NewLife GPI
      </div>

      <ul className="flex flex-1 flex-col gap-1">
        {visibleNavItems.map((item) => {
          const isActive = item.key === activeKey;
          const Icon = item.icon;
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-white/10 text-white"
                    : "text-aegean-200 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon size={18} aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-2.5 border-t border-white/10 pt-4">
        {/* afterSignOutUrl moved to <ClerkProvider> in src/app/layout.tsx —
        deprecated on UserButton itself (verified against Clerk's current
        docs: github.com/clerk/javascript/pull/3544). */}
        <UserButton />
        <div className="flex-1 text-[13px] font-normal text-aegean-200">
          {client.property}
        </div>
      </div>
    </nav>
  );
}
