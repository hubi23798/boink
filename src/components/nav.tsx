"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import { cn } from "@/lib/utils";
import { TruffleMark } from "@/components/truffle-mark";
import {
  Home,
  TrendingUp,
  ArrowLeftRight,
  Target,
  BarChart2,
  MessageCircle,
  Settings,
  Mail,
  RefreshCw,
  Tag,
  Lightbulb,
  LogOut,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

const PRIMARY_LINKS: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/wealth", label: "Wealth", icon: TrendingUp },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/transactions/inbox", label: "Inbox", icon: Mail },
  { href: "/recurring", label: "Recurring", icon: RefreshCw },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/budget", label: "Budget", icon: BarChart2 },
  { href: "/advisor", label: "Advisor", icon: MessageCircle },
  { href: "/categories", label: "Categories", icon: Tag },
  { href: "/insights", label: "Insights", icon: Lightbulb },
];

const UTILITY_LINKS: NavItem[] = [{ href: "/settings", label: "Settings", icon: Settings }];

function NavLink({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href as Route}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group text-body-strong relative flex items-center gap-3 rounded-md px-3 py-2",
        "transition-colors duration-150",
        "border-l-[3px] pl-[9px]",
        isActive
          ? "bg-card text-fg-default border-gold"
          : "text-fg-muted hover:bg-card hover:text-fg-default border-transparent",
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors duration-150",
          isActive ? "text-gold" : "text-fg-subtle group-hover:text-fg-muted",
        )}
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function SignOutItem() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch("/api/auth/logout", { method: "POST" });
          window.location.href = "/login";
        } catch {
          setBusy(false);
        }
      }}
      className={cn(
        "group text-body-strong flex w-full items-center gap-3 rounded-md px-3 py-2",
        "transition-colors duration-150",
        "border-l-[3px] border-transparent pl-[9px]",
        "text-fg-muted hover:bg-card hover:text-fg-default disabled:opacity-50",
      )}
    >
      <LogOut
        className="text-fg-subtle group-hover:text-fg-muted h-4 w-4 shrink-0 transition-colors duration-150"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <span>{busy ? "Signing out…" : "Sign out"}</span>
    </button>
  );
}

export function SidebarNav({ className }: { className?: string }) {
  const pathname = usePathname();

  if (pathname === "/login" || pathname === "/landing" || pathname.startsWith("/landing/")) {
    return null;
  }

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    if (href === "/transactions") {
      return (
        pathname === "/transactions" ||
        (pathname.startsWith("/transactions/") && !pathname.startsWith("/transactions/inbox"))
      );
    }
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <aside
      className={cn(
        "flex h-full w-[220px] shrink-0 flex-col",
        "bg-sidebar border-line border-r",
        className,
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5">
        <TruffleMark size={28} small />
        <span
          className="text-fg-default text-[17px] leading-none font-extrabold tracking-[-0.03em]"
          aria-label="truffe.ai"
        >
          truffe<span className="text-gold">.ai</span>
        </span>
      </div>

      {/* Primary nav */}
      <nav
        className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-1"
        aria-label="Main navigation"
      >
        {PRIMARY_LINKS.map((item) => (
          <NavLink key={item.href} item={item} isActive={isActive(item.href)} />
        ))}
      </nav>

      {/* Utility + sign out */}
      <div
        className="border-line flex flex-col gap-0.5 border-t px-2 py-3"
        aria-label="Utility navigation"
      >
        {UTILITY_LINKS.map((item) => (
          <NavLink key={item.href} item={item} isActive={isActive(item.href)} />
        ))}
        <SignOutItem />
      </div>
    </aside>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMarketing = pathname === "/landing" || pathname.startsWith("/landing/");

  if (isMarketing) return <>{children}</>;

  return (
    <div className="bg-page flex h-screen overflow-hidden">
      <SidebarNav />
      <main className="flex flex-1 flex-col overflow-y-auto">{children}</main>
    </div>
  );
}
