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
  Shield,
  Building2,
  LayoutGrid,
  Kanban,
  Zap,
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
  /**
   * Label shown to an admin instead of `label`.
   *
   * These pages show genuinely different content per role — a client sees
   * their own unit, an admin sees every unit sold — so "My Property" is
   * actively wrong in the admin's sidebar. The nav item is shared because the
   * route is shared; only the wording differs.
   */
  adminLabel?: string;
}

export const SIDEBAR_NAV_ITEMS: SidebarNavItem[] = [
  { key: "overview", label: "Overview", href: "/dashboard", icon: Home },
  // Sits directly above Clients because that is the order of the business:
  // a person is a prospect on the pipeline before they are a client on the
  // roster, and the two pages are the two halves of one relationship.
  { key: "pipeline", label: "Pipeline", href: "/dashboard/pipeline", icon: Kanban, adminOnly: true },
  { key: "clients", label: "Clients", href: "/dashboard/clients", icon: Users, adminOnly: true },
  {
    key: "property",
    label: "My Property",
    adminLabel: "Properties Sold",
    href: "/dashboard/property",
    icon: Building2,
  },
  { key: "construction", label: "Construction", href: "/dashboard/construction", icon: HardHat },
  { key: "visa", label: "Golden Visa", href: "/dashboard/visa", icon: Stamp },
  {
    key: "payments",
    label: "Payments & expenses",
    adminLabel: "Payments",
    href: "/dashboard/payments",
    icon: Wallet,
  },
  { key: "rental", label: "Rental & taxes", adminLabel: "Rentals", href: "/dashboard/rental", icon: KeyRound },
  { key: "projects", label: "Available Projects", href: "/dashboard/projects", icon: LayoutGrid },
  // Shield, not Users: Clients now owns the Users icon, and two nav items
  // with the same glyph is worse than a slightly less literal one.
  {
    key: "automations",
    label: "Automations",
    href: "/dashboard/automations",
    icon: Zap,
    adminOnly: true,
  },
  { key: "team", label: "Team", href: "/dashboard/team", icon: Shield, adminOnly: true },
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
                {isAdmin && item.adminLabel ? item.adminLabel : item.label}
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
