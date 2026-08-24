import React, { useState, useEffect } from "react";
import { Save, ShieldCheck, RefreshCw, Info } from "lucide-react";
import adminFinanceApi from "../services/api/financeApi";

const FIELD_GROUPS = [
  {
    title: "Zoogno GST Registration",
    desc: "Zoogno's own GSTIN and state details for service invoices and commission invoices.",
    fields: [
      { key: "zoognoGstin", label: "Zoogno GSTIN", placeholder: "29XXXXX1234X1Z5", type: "text" },
      { key: "zoognoLegalName", label: "Zoogno Legal Name", placeholder: "Zoogno Pvt Ltd", type: "text" },
      { key: "zoognoStateCode", label: "Zoogno State Code", placeholder: "21", type: "text", maxLen: 2 },
      { key: "zoognoState", label: "Zoogno State", placeholder: "Odisha", type: "text" },
    ],
  },
  {
    title: "TCS Registration (Section 52)",
    desc: "Separate TCS GSTIN for ECO (Electronic Commerce Operator) filings. May differ from main GSTIN.",
    fields: [
      { key: "tcsGstin", label: "TCS GSTIN", placeholder: "21XXXXX1234X1Z5 (leave blank if same as main)", type: "text" },
      { key: "tcsStateName", label: "TCS State", placeholder: "Odisha", type: "text" },
    ],
  },
  {
    title: "ECO Tax Mechanism & TCS Rate",
    desc: "Default ECO tax mechanism for marketplace seller transactions. Override per-seller in Seller settings.",
    fields: [
      {
        key: "defaultEcoTaxMechanism",
        label: "Default ECO Tax Mechanism",
        type: "select",
        options: [
          { value: "SECTION_52_TCS", label: "Section 52 — TCS (Seller raises invoice, Zoogno collects TCS)" },
          { value: "SECTION_9_5", label: "Section 9(5) — ECO Deemed Supplier (specific notified services only)" },
          { value: "NORMAL_SUPPLY", label: "Normal Supply (No TCS, seller pays own GST)" },
        ],
      },
      { key: "tcsRate", label: "TCS Rate (%)", placeholder: "1", type: "number", min: 0, max: 100, step: 0.01 },
    ],
  },
  {
    title: "Platform Fee (SAC & Rate)",
    desc: "SAC code and GST rate for Zoogno's platform fee charged to customers.",
    fields: [
      { key: "platformFeeSac", label: "Platform Fee SAC", placeholder: "998599", type: "text" },
      { key: "platformFeeGstRate", label: "GST Rate (%)", placeholder: "18", type: "number", min: 0, max: 28 },
      { key: "platformFeeDescription", label: "Description", placeholder: "Online Marketplace Services", type: "text" },
    ],
  },
  {
    title: "Delivery Fee (SAC & Rate)",
    desc: "SAC code and GST rate for delivery fee charged to customers.",
    fields: [
      { key: "deliveryFeeSac", label: "Delivery Fee SAC", placeholder: "996813", type: "text" },
      { key: "deliveryFeeGstRate", label: "GST Rate (%)", placeholder: "18", type: "number", min: 0, max: 28 },
      { key: "deliveryFeeDescription", label: "Description", placeholder: "Local Delivery of Goods", type: "text" },
    ],
  },
  {
    title: "Handling Fee (SAC & Rate)",
    desc: "SAC code and GST rate for handling/packaging fee.",
    fields: [
      { key: "handlingFeeSac", label: "Handling Fee SAC", placeholder: "996711", type: "text" },
      { key: "handlingFeeGstRate", label: "GST Rate (%)", placeholder: "18", type: "number", min: 0, max: 28 },
      { key: "handlingFeeDescription", label: "Description", placeholder: "Packaging and Handling Charges", type: "text" },
    ],
  },
  {
    title: "Seller Commission (SAC & Rate)",
    desc: "SAC code and GST rate for Zoogno's commission charged to sellers.",
    fields: [
      { key: "commissionSac", label: "Commission SAC", placeholder: "998599", type: "text" },
      { key: "commissionGstRate", label: "GST Rate (%)", placeholder: "18", type: "number", min: 0, max: 28 },
      { key: "commissionDescription", label: "Description", placeholder: "Marketplace Commission", type: "text" },
    ],
  },
  {
    title: "Financial Year Settings",
    desc: "Financial year start month (India = April = 4).",
    fields: [
      { key: "fyStartMonth", label: "FY Start Month (1-12)", placeholder: "4", type: "number", min: 1, max: 12 },
    ],
  },
];

export default function GstConfig() {
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await adminFinanceApi.getGstConfig();
      setForm(res.data?.data || {});
    } catch {
      setError("Failed to load GST config.");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await adminFinanceApi.updateGstConfig(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e?.response?.data?.message || "Failed to save GST config.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 300 }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div style={{ padding: "24px", maxWidth: 900, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 14,
          background: "linear-gradient(135deg, #10b981, #059669)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <ShieldCheck size={24} color="#fff" />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#0f172a" }}>GST Tax Configuration</h1>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "#64748b" }}>
            CA-configurable SAC codes, GST rates, ECO mechanism &amp; TCS settings
          </p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          <button
            onClick={fetchConfig}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 16px", borderRadius: 8,
              border: "1.5px solid #e2e8f0", background: "#fff",
              color: "#334155", fontSize: 13, fontWeight: 500, cursor: "pointer",
            }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 20px", borderRadius: 8,
              background: saving ? "#94a3b8" : (saved ? "#10b981" : "linear-gradient(135deg, #6366f1, #4f46e5)"),
              color: "#fff", fontSize: 13, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer",
              border: "none",
            }}
          >
            <Save size={14} /> {saving ? "Saving..." : saved ? "✓ Saved" : "Save Changes"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          background: "#fef2f2", border: "1.5px solid #fca5a5",
          borderRadius: 10, padding: "12px 16px", marginBottom: 20,
          color: "#dc2626", fontSize: 13,
        }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {FIELD_GROUPS.map((group) => (
          <div key={group.title} style={{
            background: "#fff", borderRadius: 14,
            border: "1.5px solid #e2e8f0",
            padding: "20px 24px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          }}>
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#1e293b" }}>{group.title}</h3>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b", display: "flex", alignItems: "center", gap: 5 }}>
                <Info size={12} /> {group.desc}
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 16 }}>
              {group.fields.map((field) => (
                <div key={field.key}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 6 }}>
                    {field.label}
                  </label>
                  {field.type === "select" ? (
                    <select
                      value={form[field.key] || ""}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      style={{
                        width: "100%", padding: "9px 12px",
                        borderRadius: 8, border: "1.5px solid #e2e8f0",
                        fontSize: 13, color: "#0f172a", background: "#f8fafc",
                        outline: "none",
                      }}
                    >
                      {field.options.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type || "text"}
                      placeholder={field.placeholder}
                      value={form[field.key] ?? ""}
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      maxLength={field.maxLen}
                      onChange={(e) => handleChange(field.key,
                        field.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value
                      )}
                      style={{
                        width: "100%", padding: "9px 12px",
                        borderRadius: 8, border: "1.5px solid #e2e8f0",
                        fontSize: 13, color: "#0f172a", background: "#f8fafc",
                        outline: "none", boxSizing: "border-box",
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "12px 28px", borderRadius: 10,
            background: saving ? "#94a3b8" : "linear-gradient(135deg, #6366f1, #4f46e5)",
            color: "#fff", fontSize: 14, fontWeight: 700,
            cursor: saving ? "not-allowed" : "pointer", border: "none",
            boxShadow: "0 4px 14px rgba(99,102,241,0.3)",
          }}
        >
          <Save size={16} /> {saving ? "Saving..." : "Save All Changes"}
        </button>
      </div>
    </div>
  );
}
