'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Shield,
  Bell,
  ChevronDown,
  LogOut,
} from 'lucide-react';
import { auth } from '@/lib/api';
import { NotificationsPopover } from './notifications-popover';

const NAV = ['Overview', 'Key Alerts', 'Insights', 'Executions'];

interface TopNavProps {
  activeTab?: string;
  onSelectTab?: (tab: string) => void;
}

export function TopNav({ activeTab = 'Overview', onSelectTab }: TopNavProps) {
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const [currentUser, setCurrentUser] = useState(() => ({
    username: auth.getUsername(),
    role: auth.getRole(),
  }));

  useEffect(() => {
    // Sync with auth
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

    window.addEventListener('auth-changed', handleAuthChange);
    return () => window.removeEventListener('auth-changed', handleAuthChange);
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
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = () => {
    setIsProfileMenuOpen(false);
    auth.clearSession();
  };

  const getRoleBadgeStyle = (role: string) => {
    switch (role.toUpperCase()) {
      case 'ADMIN':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'ANALYST':
        return 'bg-brand-soft text-brand border-brand/30';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getAvatarBg = (role: string) => {
    switch (role.toUpperCase()) {
      case 'ADMIN':
        return 'bg-rose-100 text-rose-700';
      case 'ANALYST':
        return 'bg-violet-100 text-violet-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <header className="shrink-0 flex items-center justify-between px-2 py-0.5 2xl:py-1">
      {/* Brand */}
      <div className="flex items-center gap-2.5 2xl:gap-3">
        <div className="flex h-8 w-8 2xl:h-9 2xl:w-9 items-center justify-center rounded-xl bg-brand text-brand-foreground shadow-sm">
          <Shield className="h-4.5 w-4.5 2xl:h-5 2xl:w-5" strokeWidth={2.25} />
        </div>
        <span className="text-base 2xl:text-lg font-semibold tracking-tight text-foreground">
          VertexAI
        </span>
        <span className="hidden sm:inline-block rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-700 border border-emerald-200">
          HITL SUPERVISED
        </span>
      </div>

      {/* Center nav */}
      <nav className="hidden items-center gap-1 md:flex">
        {NAV.map((item) => {
          const active = activeTab === item;
          return (
            <button
              key={item}
              onClick={() => onSelectTab?.(item)}
              className={
                'rounded-lg px-3 2xl:px-4 py-1 2xl:py-1.5 font-mono text-xs 2xl:text-sm transition-all ' +
                (active
                  ? 'border border-brand/40 bg-brand-soft font-bold text-brand shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50')
              }
            >
              {item}
            </button>
          );
        })}
      </nav>

      {/* Right controls */}
      <div className="flex items-center gap-2.5 2xl:gap-3">
        <button className="flex items-center gap-1.5 2xl:gap-2 rounded-lg border border-slate-200 bg-white px-2.5 2xl:px-3 py-1 2xl:py-1.5 font-mono text-xs 2xl:text-sm text-slate-600 shadow-sm">
          <span className="h-1.5 w-1.5 2xl:h-2 2xl:w-2 rounded-full bg-emerald-500" />
          Backend :8080
          <span className="text-slate-300">·</span>
          Production
          <ChevronDown className="h-3 w-3 2xl:h-3.5 2xl:w-3.5 text-slate-400" />
        </button>

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
              className={`flex h-6 w-6 2xl:h-7 2xl:w-7 items-center justify-center rounded-lg font-mono text-[11px] font-bold ${getAvatarBg(
                currentUser.role
              )}`}
            >
              {currentUser.username.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex flex-col items-start text-left">
              <span className="font-mono text-[11px] 2xl:text-xs font-bold text-slate-800 leading-none">
                {currentUser.username}
              </span>
              <span
                className={`mt-0.5 rounded px-1 py-0.2 font-mono text-[8px] 2xl:text-[9px] font-bold border ${getRoleBadgeStyle(
                  currentUser.role
                )}`}
              >
                {currentUser.role}
              </span>
            </div>
            <ChevronDown className={`h-3 w-3 text-slate-400 group-hover:text-slate-700 transition-transform ${isProfileMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Profile Dropdown Popover */}
          {isProfileMenuOpen && (
            <div className="absolute right-0 top-11 z-50 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
              {/* User Info Header */}
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-xl font-mono text-xs font-bold ${getAvatarBg(
                    currentUser.role
                  )}`}
                >
                  {currentUser.username.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs font-bold text-slate-900 truncate">
                    {currentUser.username}
                  </p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span
                      className={`rounded px-1.5 py-0.2 font-mono text-[9px] font-bold border ${getRoleBadgeStyle(
                        currentUser.role
                      )}`}
                    >
                      {currentUser.role}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Active
                    </span>
                  </div>
                </div>
              </div>

              {/* Sign Out Action */}
              <div className="mt-2">
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left font-mono text-xs text-rose-600 hover:bg-rose-50 transition-colors group"
                >
                  <LogOut className="h-4 w-4 text-rose-500 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                  <div className="min-w-0 flex-1">
                    <span className="font-bold block">Sign Out</span>
                    <span className="text-[10px] text-rose-400 block">End current session</span>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}



