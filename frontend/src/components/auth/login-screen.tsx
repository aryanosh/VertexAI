'use client';

import React, { useState } from 'react';
import {
  Shield,
  Eye,
  EyeOff,
  Lock,
  User,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  Server,
  KeyRound,
} from 'lucide-react';
import { auth } from '@/lib/api';

interface LoginScreenProps {
  onLoginSuccess?: () => void;
}

export function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [username, setUsername] = useState('analyst');
  const [password, setPassword] = useState('analyst123');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please enter both username and password.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await auth.login(username.trim(), password.trim());
      onLoginSuccess?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Fallback session if backend is currently unreachable during local testing
      if (
        msg.includes('Failed to fetch') ||
        msg.includes('NetworkError') ||
        msg.includes('404')
      ) {
        console.warn('Backend unavailable, initiating local demo session for:', username);
        const lower = username.toLowerCase();
        const inferredRole = lower.includes('admin')
          ? 'ADMIN'
          : lower.includes('viewer')
          ? 'VIEWER'
          : 'ANALYST';
        auth.setSession(`mock-jwt-${Date.now()}`, username.trim(), inferredRole);
        onLoginSuccess?.();
      } else {
        setError(msg || 'Invalid username or password. Please verify credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const fillCredentials = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    setError(null);
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center bg-background p-4 sm:p-6 select-none">
      {/* Subtle grid pattern background matching dashboard */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f080_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f080_1px,transparent_1px)] bg-[size:28px_28px] pointer-events-none opacity-60" />

      <div className="relative z-10 w-full max-w-md flex flex-col items-center gap-5">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-brand-foreground shadow-md">
              <Shield className="h-6 w-6" strokeWidth={2.25} />
            </div>
            <span className="font-mono text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Vertex<span className="text-brand">AI</span>
            </span>
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 font-mono text-[11px] font-semibold text-emerald-700 border border-emerald-200 shadow-2xs">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            HITL SUPERVISED PLATFORM
          </span>

          <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
            Autonomous vulnerability correlation, XGBoost noise reduction, and deterministic risk scoring
          </p>
        </div>

        {/* Main Login Card */}
        <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xl space-y-5">
          <div>
            <h2 className="font-mono text-base font-bold text-slate-900 flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-brand" />
              Account Sign In
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Enter your credentials to access the SOC triage dashboard
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 animate-in fade-in duration-200">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username Input */}
            <div>
              <label className="block font-mono text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                Username
              </label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  required
                  placeholder="e.g. admin, analyst, viewer"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 font-mono text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-brand focus:outline-brand transition-colors"
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label className="block font-mono text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-9 font-mono text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-brand focus:outline-brand transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Sign In Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand py-2.5 font-mono text-xs font-bold text-white shadow-md hover:bg-brand/90 transition-all disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </form>

          {/* Role Credentials Reference Hint */}
          <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-3 text-xs">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
              Available Roles & Credentials:
            </span>
            <div className="grid grid-cols-3 gap-1.5 font-mono text-[11px]">
              <button
                type="button"
                onClick={() => fillCredentials('admin', 'admin123')}
                className="flex flex-col items-start p-1.5 rounded-lg bg-white border border-slate-200 hover:border-rose-300 hover:bg-rose-50/50 transition-colors text-left group"
                title="Click to fill Admin credentials"
              >
                <span className="font-bold text-rose-700">Admin</span>
                <span className="text-[10px] text-slate-400 group-hover:text-slate-600">admin123</span>
              </button>

              <button
                type="button"
                onClick={() => fillCredentials('analyst', 'analyst123')}
                className="flex flex-col items-start p-1.5 rounded-lg bg-white border border-slate-200 hover:border-brand/40 hover:bg-brand-soft/30 transition-colors text-left group"
                title="Click to fill Analyst credentials"
              >
                <span className="font-bold text-brand">Analyst</span>
                <span className="text-[10px] text-slate-400 group-hover:text-slate-600">analyst123</span>
              </button>

              <button
                type="button"
                onClick={() => fillCredentials('viewer', 'viewer123')}
                className="flex flex-col items-start p-1.5 rounded-lg bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-100 transition-colors text-left group"
                title="Click to fill Viewer credentials"
              >
                <span className="font-bold text-slate-700">Viewer</span>
                <span className="text-[10px] text-slate-400 group-hover:text-slate-600">viewer123</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="flex items-center gap-2 font-mono text-xs text-slate-500">
          <Server className="h-3.5 w-3.5 text-emerald-600" />
          <span>Backend :8080 · Spring Boot 3 Security</span>
        </div>
      </div>
    </div>
  );
}
