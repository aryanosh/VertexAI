"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "./ThemeProvider";
import { useAuth, roleBadgeText } from "./AuthProvider";

const NAV_LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/scans", label: "Scans" },
  { href: "/assets", label: "Assets" },
  { href: "/reports", label: "Reports" },
];

export function TopNav() {
  const { theme, toggleTheme } = useTheme();
  const { token, role, username, logout } = useAuth();
  const pathname = usePathname();
  const isDark = theme === "dark";

  return (
    <nav style={{
      height: 56,
      background: "var(--bg-card)",
      borderBottom: "1px solid var(--border)",
      display: "flex",
      alignItems: "center",
      padding: "0 24px",
      gap: 0,
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 100,
    }}>
      {/* Logo */}
      <div className="flex items-center gap-2.5" style={{ marginRight: 40 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: "linear-gradient(135deg, #f04e1f, #d93c10)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16, boxShadow: "0 0 12px rgba(240,78,31,0.4)",
        }}>⬡</div>
        <span style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>VertexAI</span>
      </div>

      {/* Route links */}
      <div className="flex items-center gap-1">
        {NAV_LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              style={{
                padding: "6px 16px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                color: active ? "var(--text-primary)" : "var(--text-muted)",
                background: active ? "rgba(240,78,31,0.15)" : "transparent",
                transition: "all 0.2s",
                textDecoration: "none",
              }}
            >
              {link.label}
            </Link>
          );
        })}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3 ml-auto">
        {/* Live role badge */}
        <span
          style={{
            padding: "5px 12px",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            background: role === "ADMIN" ? "rgba(240,78,31,0.15)" : role === "ANALYST" ? "rgba(6,182,212,0.15)" : "var(--surface-2)",
            color: role === "ADMIN" ? "#f04e1f" : role === "ANALYST" ? "#06b6d4" : "var(--text-secondary)",
            border: "1px solid var(--border)",
            whiteSpace: "nowrap",
          }}
        >
          {token ? roleBadgeText(role) : "Not signed in"}
        </span>

        {/* Theme toggle */}
        <button
          id="theme-toggle"
          onClick={toggleTheme}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "6px 10px",
            color: "var(--text-secondary)",
            cursor: "pointer",
            fontSize: 15,
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          {isDark ? "☀️" : "🌙"}
          <span style={{ fontSize: 11, fontWeight: 500 }}>{isDark ? "Light" : "Dark"}</span>
        </button>

        {token && (
          <button
            onClick={logout}
            title={`Sign out ${username ?? ""}`}
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "6px 12px",
              color: "var(--text-secondary)",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            Sign out
          </button>
        )}
      </div>
    </nav>
  );
}
