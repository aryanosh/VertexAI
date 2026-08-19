"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export type Role = "ADMIN" | "ANALYST" | "VIEWER";

export const READ_ONLY_MESSAGE =
  "Read-Only Mode: You need Analyst or Admin privileges to perform this action.";

interface AuthContextValue {
  token: string | null;
  username: string | null;
  role: Role | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<string | null>;
  logout: () => void;
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextValue>({
  token: null,
  username: null,
  role: null,
  ready: false,
  login: async () => "Auth provider not mounted",
  logout: () => {},
  apiFetch: async (path: string, init?: RequestInit) => fetch(`${API_BASE}${path}`, init),
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [ready, setReady] = useState(false);

  // Restore session from localStorage (JWT issued by the existing backend)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("vertexai-auth");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.token) {
          setToken(parsed.token);
          setUsername(parsed.username || null);
          setRole(parsed.role || null);
        }
      }
    } catch {}
    setReady(true);
  }, []);

  const login = useCallback(async (u: string, p: string): Promise<string | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, password: p }),
      });
      if (!res.ok) return "Invalid username or password.";
      const data = await res.json();
      if (!data?.token) return "Login failed: no token returned.";
      setToken(data.token);
      setUsername(data.username || u);
      setRole((data.role as Role) || null);
      localStorage.setItem(
        "vertexai-auth",
        JSON.stringify({ token: data.token, username: data.username || u, role: data.role })
      );
      return null;
    } catch {
      return "Backend unreachable. Is the API running on " + API_BASE + "?";
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUsername(null);
    setRole(null);
    try { localStorage.removeItem("vertexai-auth"); } catch {}
  }, []);

  const apiFetch = useCallback(async (path: string, init?: RequestInit) => {
    return fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  }, [token]);

  return (
    <AuthContext.Provider value={{ token, username, role, ready, login, logout, apiFetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

export function roleBadgeText(role: Role | null): string {
  if (role === "ADMIN") return "👑 Logged in as: Admin";
  if (role === "ANALYST") return "🔍 Logged in as: Analyst";
  if (role === "VIEWER") return "👁️ Logged in as: Viewer (Read-Only)";
  return "Not signed in";
}

function SignInCard() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = await login(username.trim(), password);
    if (err) setError(err);
    setBusy(false);
  };

  const quick = async (u: string, p: string) => {
    setBusy(true);
    setError(null);
    const err = await login(u, p);
    if (err) setError(err);
    setBusy(false);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "var(--surface-2)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "9px 12px",
    color: "var(--text-primary)",
    fontSize: 13,
    outline: "none",
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "var(--bg-primary)", paddingTop: 56 }}>
      <div className="card" style={{ width: 380, padding: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: "linear-gradient(135deg, #f04e1f, #d93c10)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>⬡</div>
          <span style={{ fontWeight: 700, fontSize: 17, color: "var(--text-primary)" }}>VertexAI</span>
        </div>
        <div style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 18 }}>
          Sign in to the Security Operations Dashboard
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            style={inputStyle}
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
          <input
            style={inputStyle}
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          {error && (
            <div style={{ color: "#ef4444", fontSize: 12 }}>{error}</div>
          )}
          <button className="btn-primary" type="submit" disabled={busy || !username || !password} style={{ width: "100%", padding: "9px 0", marginTop: 4 }}>
            {busy ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <div style={{ borderTop: "1px solid var(--border)", marginTop: 18, paddingTop: 14 }}>
          <div style={{ color: "var(--text-muted)", fontSize: 11, marginBottom: 8 }}>Demo accounts</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-ghost" disabled={busy} style={{ flex: 1, padding: "6px 0", fontSize: 11 }} onClick={() => quick("admin", "admin123")}>👑 Admin</button>
            <button className="btn-ghost" disabled={busy} style={{ flex: 1, padding: "6px 0", fontSize: 11 }} onClick={() => quick("analyst", "analyst123")}>🔍 Analyst</button>
            <button className="btn-ghost" disabled={busy} style={{ flex: 1, padding: "6px 0", fontSize: 11 }} onClick={() => quick("viewer", "viewer123")}>👁️ Viewer</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token, ready } = useAuth();
  if (!ready) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg-primary)", color: "var(--text-muted)", fontSize: 14 }}>
        Loading…
      </div>
    );
  }
  if (!token) return <SignInCard />;
  return <>{children}</>;
}
