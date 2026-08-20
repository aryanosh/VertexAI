'use client';

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Shield,
  Bell,
  ChevronDown,
  LogOut,
  LayoutDashboard,
  Upload,
  ShieldAlert,
  GitFork,
  FileText,
} from "lucide-react";
import { auth } from "@/lib/api";
import { NotificationsPopover } from "./notifications-popover";

export const NAV_LINKS = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Uploads", href: "/uploads", icon: Upload },
  { name: "Findings", href: "/findings", icon: ShieldAlert },
  { name: "Pipeline", href: "/pipeline", icon: GitFork },
  { name: "Reports", href: "/reports", icon: FileText },
];

interface TopNavProps {
  activeTab?: string;
  onSelectTab?: (tab: string) => void;
}

export function TopNav({ activeTab, onSelectTab }: TopNavProps) {
  const pathname = usePathname();
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const [currentUser, setCurrentUser] = useState(() => ({
    username: auth.getUsername(),
    role: auth.getRole(),
  }));

  useEffect(() => {
    setCurrentUser({
      username: auth.getUsername(),
      role: auth.getRole(),
    });

    const handleAuthChange = (e: Event) => {
      const custom = e as CustomEvent<{ username?: string; role?: string }>;
      if (custom.detail) {
        setCurrentUser({
          username: custom.detail.username || auth.getUsername(),
          role: custom.detail.role || auth.getRole(),
        });
      }
    };

    window.addEventListener("auth-changed", handleAuthChange);
    return () => window.removeEventListener("auth-changed", handleAuthChange);
  }, []);

  // Close profile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target as Node)
      ) {
        setIsProfileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = () => {
    setIsProfileMenuOpen(false);
    auth.clearSession();
  };

  const getRoleBadgeStyle = (role: string) => {
    switch (role.toUpperCase()) {
      case "ADMIN":
        return "bg-rose-50 text-rose-700 border-rose-200";
      case "ANALYST":
        return "bg-brand-soft text-brand border-brand/30";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  const getAvatarBg = (role: string) => {
    switch (role.toUpperCase()) {
      case "ADMIN":
        return "bg-rose-100 text-rose-700";
      case "ANALYST":
        return "bg-violet-100 text-violet-700";
      default:
        return "bg-slate-100 text-slate-700";
    }
  };

  return (
    <header className="shrink-0 flex items-center justify-between px-2 py-0.5 2xl:py-1">
      {/* Brand */}
      <Link href="/dashboard" className="flex items-center gap-2.5 2xl:gap-3 group">
        <div className="flex h-8 w-8 2xl:h-9 2xl:w-9 items-center justify-center rounded-xl bg-brand text-brand-foreground shadow-sm group-hover:scale-105 transition-transform">
          <Shield className="h-4.5 w-4.5 2xl:h-5 2xl:w-5" strokeWidth={2.25} />
        </div>
        <div>
          <span className="text-base 2xl:text-lg font-semibold tracking-tight text-foreground font-mono">
            VertexAI
          </span>
          <span className="hidden sm:inline-block ml-2 rounded bg-slate-100 px-1.5 py-0.2 font-mono text-[9px] font-bold text-slate-600 border border-slate-200">
            SOC PLATFORM
          </span>
        </div>
      </Link>

      {/* Center Nav Links (Next.js 14 App Router) */}
      <nav className="hidden items-center gap-1 md:flex">
        {NAV_LINKS.map((link) => {
          const isActive =
            pathname === link.href ||
            (link.href === "/dashboard" && (pathname === "/" || activeTab === "Overview")) ||
            (link.href === "/findings" && activeTab === "Key Alerts") ||
            (link.href === "/reports" && activeTab === "Insights") ||
            (link.href === "/uploads" && activeTab === "Executions");
          const Icon = link.icon;

          return (
            <Link
              key={link.name}
              href={link.href}
              onClick={() => onSelectTab?.(link.name)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-xs 2xl:text-sm transition-all ${
                isActive
                  ? "border border-brand/40 bg-brand-soft font-bold text-brand shadow-2xs"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-100/70"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {link.name}
            </Link>
          );
        })}
      </nav>

      {/* Right Controls */}
      <div className="flex items-center gap-2.5 2xl:gap-3">
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-mono text-xs text-slate-600 shadow-xs">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Backend :8080</span>
        </div>

        {/* Notification Button & Popover */}
        <div className="relative">
          <button
            onClick={() => setIsNotifOpen(!isNotifOpen)}
            className="relative flex h-8 w-8 2xl:h-9 2xl:w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm hover:text-slate-800 transition-colors"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4 2xl:h-4.5 2xl:w-4.5" />
            <span className="absolute right-1.5 top-1.5 2xl:right-2 2xl:top-2 h-1.5 w-1.5 rounded-full bg-brand" />
          </button>

          <NotificationsPopover
            isOpen={isNotifOpen}
            onClose={() => setIsNotifOpen(false)}
          />
        </div>

        {/* User Profile & Sign Out Dropdown */}
        <div className="relative" ref={profileMenuRef}>
          <button
            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1 pr-2.5 shadow-sm hover:border-slate-300 transition-all group"
            title="User Account & Session"
          >
            <div
              className={`flex h-7 w-7 2xl:h-8 2xl:w-8 items-center justify-center rounded-lg font-mono text-xs 2xl:text-sm font-bold uppercase transition-colors ${getAvatarBg(
                currentUser.role
              )}`}
            >
              {currentUser.username.slice(0, 2)}
            </div>
            <div className="hidden text-left lg:block">
              <p className="font-mono text-xs font-semibold leading-none text-slate-800 group-hover:text-slate-900">
                {currentUser.username}
              </p>
              <p className="mt-0.5 font-mono text-[10px] uppercase leading-none text-slate-400">
                {currentUser.role}
              </p>
            </div>
            <ChevronDown
              className={`h-3 w-3 text-slate-400 group-hover:text-slate-700 transition-transform ${
                isProfileMenuOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {/* Profile Dropdown Popover */}
          {isProfileMenuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="border-b border-slate-100 px-3 py-2">
                <p className="font-mono text-xs font-bold text-slate-900">
                  {currentUser.username}
                </p>
                <div className="mt-1 flex items-center gap-1.5">
                  <span
                    className={`rounded border px-1.5 py-0.2 font-mono text-[10px] font-semibold ${getRoleBadgeStyle(
                      currentUser.role
                    )}`}
                  >
                    {currentUser.role}
                  </span>
                  <span className="font-mono text-[10px] text-slate-400">Active</span>
                </div>
              </div>

              <div className="py-1">
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 transition-colors font-mono"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
