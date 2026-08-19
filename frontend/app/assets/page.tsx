"use client";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth, useAuth, READ_ONLY_MESSAGE } from "../components/AuthProvider";

interface AssetItem {
  asset_id: string;
  hostname: string;
  ip_address?: string;
  environment?: string;
  criticality_rating?: number;
  owner_email?: string;
  is_authorized?: boolean;
}

const EMPTY_FORM = {
  hostname: "",
  ip_address: "",
  environment: "PRODUCTION",
  criticality_rating: 3,
  owner_email: "",
  is_authorized: true,
};

function AssetsContent() {
  const { apiFetch, role, token } = useAuth();
  const canManage = role === "ADMIN" || role === "ANALYST";

  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/assets");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAssets(Array.isArray(data) ? data : []);
    } catch {
      setError("Failed to load assets from the backend.");
    }
    setLoading(false);
  }, [apiFetch]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await apiFetch("/api/assets", { method: "POST", body: JSON.stringify(form) });
      if (res.ok) {
        setSaveMsg("Asset registered successfully.");
        setForm({ ...EMPTY_FORM });
        await load();
      } else {
        setSaveMsg(`Registration failed (HTTP ${res.status}). Check the form values.`);
      }
    } catch {
      setSaveMsg("Backend unreachable.");
    }
    setSaving(false);
    setTimeout(() => setSaveMsg(null), 5000);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "var(--surface-2)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "8px 10px",
    color: "var(--text-primary)",
    fontSize: 12,
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    color: "var(--text-muted)",
    fontSize: 11,
    fontWeight: 600,
    marginBottom: 4,
    display: "block",
  };

  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: 16 }}>Assets</div>
        <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
          Registered infrastructure assets — scans require an authorized asset
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16, alignItems: "start" }}>
        {/* Register form */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Register Asset</div>
          {!canManage ? (
            <div style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.6 }}>
              🔒 {READ_ONLY_MESSAGE}
            </div>
          ) : (
            <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label style={labelStyle}>Hostname *</label>
                <input style={inputStyle} value={form.hostname} onChange={(e) => setForm({ ...form, hostname: e.target.value })} placeholder="prod-web-01.company.local" />
              </div>
              <div>
                <label style={labelStyle}>IP Address</label>
                <input style={inputStyle} value={form.ip_address} onChange={(e) => setForm({ ...form, ip_address: e.target.value })} placeholder="10.0.1.10" />
              </div>
              <div>
                <label style={labelStyle}>Environment</label>
                <select style={inputStyle} value={form.environment} onChange={(e) => setForm({ ...form, environment: e.target.value })}>
                  <option value="PRODUCTION">PRODUCTION</option>
                  <option value="STAGING">STAGING</option>
                  <option value="DEV">DEV</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Criticality (1–5)</label>
                <input style={inputStyle} type="number" min={1} max={5} value={form.criticality_rating} onChange={(e) => setForm({ ...form, criticality_rating: Number(e.target.value) })} />
              </div>
              <div>
                <label style={labelStyle}>Owner Email *</label>
                <input style={inputStyle} type="email" value={form.owner_email} onChange={(e) => setForm({ ...form, owner_email: e.target.value })} placeholder="owner@company.com" />
              </div>
              {saveMsg && (
                <div style={{ color: saveMsg.includes("success") ? "#22c55e" : "#ef4444", fontSize: 12 }}>{saveMsg}</div>
              )}
              <button className="btn-primary" type="submit" disabled={saving || !form.hostname || !form.owner_email} style={{ padding: "8px 0", marginTop: 4 }}>
                {saving ? "Registering…" : "Register Asset"}
              </button>
            </form>
          )}
        </div>

        {/* Asset table */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: 13 }}>
              Registered Assets <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>({assets.length})</span>
            </span>
            <button className="btn-ghost" onClick={load} disabled={loading} style={{ padding: "4px 10px", fontSize: 11 }}>
              {loading ? "Refreshing…" : "↻ Refresh"}
            </button>
          </div>

          {loading && <div style={{ color: "var(--text-muted)", fontSize: 12, padding: 16 }}>Loading assets…</div>}

          {!loading && error && (
            <div style={{ color: "#ef4444", fontSize: 12, padding: 16 }}>
              {error} <button className="btn-ghost" onClick={load} style={{ padding: "2px 8px", fontSize: 11, marginLeft: 8 }}>Retry</button>
            </div>
          )}

          {!loading && !error && assets.length === 0 && (
            <div style={{ color: "var(--text-muted)", fontSize: 12, padding: 24, textAlign: "center" }}>
              No assets registered yet.{canManage ? " Use the form on the left to register your first asset." : ""}
            </div>
          )}

          {!loading && !error && assets.length > 0 && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 0.7fr 1.3fr 0.8fr", gap: 8, padding: "8px 12px", background: "var(--bg-card-2)", borderRadius: 8, color: "var(--text-secondary)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                <div>Hostname</div>
                <div>IP Address</div>
                <div>Environment</div>
                <div>Criticality</div>
                <div>Owner</div>
                <div>Authorized</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {assets.map((a) => (
                  <div key={a.asset_id} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 0.7fr 1.3fr 0.8fr", gap: 8, padding: "10px 12px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, alignItems: "center" }}>
                    <div style={{ color: "var(--text-primary)", fontWeight: 600, fontFamily: "monospace", fontSize: 11 }}>{a.hostname}</div>
                    <div style={{ color: "var(--text-secondary)", fontFamily: "monospace", fontSize: 11 }}>{a.ip_address || "—"}</div>
                    <div><span className="badge" style={{ fontSize: 10, background: "var(--surface-2)", color: "var(--text-secondary)" }}>{a.environment || "—"}</span></div>
                    <div style={{ color: "#eab308", fontWeight: 700 }}>{a.criticality_rating ?? "—"}/5</div>
                    <div style={{ color: "var(--text-secondary)", fontSize: 11 }}>{a.owner_email || "—"}</div>
                    <div style={{ color: a.is_authorized ? "#22c55e" : "#ef4444", fontWeight: 600, fontSize: 11 }}>{a.is_authorized ? "✓ Yes" : "✕ No"}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AssetsPage() {
  return (
    <RequireAuth>
      <div style={{ background: "var(--bg-primary)", minHeight: "100vh", paddingTop: 56 }}>
        <AssetsContent />
      </div>
    </RequireAuth>
  );
}
