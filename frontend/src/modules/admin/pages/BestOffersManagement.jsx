import React, { useEffect, useRef, useState } from "react";
import { useToast } from "@shared/components/ui/Toast";
import { adminApi } from "../services/adminApi";
import { adminBestOffersApi } from "../services/api/bestOffersApi";

const BestOffersManagement = () => {
  const { showToast } = useToast();
  const [zones, setZones] = useState([]);
  const [zoneId, setZoneId] = useState("");
  const [rows, setRows] = useState([]);
  const [guardrails, setGuardrails] = useState({
    minPlatformMargin: 5,
    minSellerPayoutPct: 60,
    allowCouponStacking: true,
    commissionBase: "discounted",
  });
  const [savingGuardrails, setSavingGuardrails] = useState(false);
  const [editingRowId, setEditingRowId] = useState(null);
  const [rowDraft, setRowDraft] = useState({
    sellerPct: 100,
    platformPct: 0,
    platformDailyCap: "",
    platformTotalCap: "",
  });
  const [savingConfig, setSavingConfig] = useState(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const dragIndex = useRef(null);
  const [overIndex, setOverIndex] = useState(null);

  useEffect(() => {
    adminApi
      .getZones()
      .then((res) => {
        const list = res.data.results || res.data.result || res.data;
        const arr = Array.isArray(list) ? list : [];
        setZones(arr);
        if (arr[0]?._id) setZoneId(arr[0]._id);
      })
      .catch(() => showToast("Failed to load zones", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!zoneId) return;
    let active = true;
    setLoading(true);
    setDirty(false);
    adminBestOffersApi
      .getZoneListings(zoneId)
      .then((res) => {
        if (!active) return;
        const payload = res.data?.result;
        if (Array.isArray(payload)) {
          setRows(payload);
        } else {
          setRows(payload?.rows || []);
          if (payload?.offerGuardrails) {
            setGuardrails((g) => ({ ...g, ...payload.offerGuardrails }));
          }
        }
      })
      .catch(() => active && showToast("Failed to load sellers", "error"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneId]);

  const move = (from, to) => {
    if (from === to || to < 0 || to >= rows.length) return;
    setRows((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    setDirty(true);
  };

  const saveOrder = async () => {
    setSaving(true);
    try {
      await adminBestOffersApi.saveZoneOrder(zoneId, rows.map((r) => r.sellerId));
      setDirty(false);
      showToast("Order saved", "success");
    } catch {
      showToast("Failed to save order", "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleVisibility = async (row) => {
    const next = row.adminStatus === "hidden" ? "active" : "hidden";
    try {
      await adminBestOffersApi.setVisibility(row.sellerId, next);
      setRows((prev) => prev.map((r) => (r.sellerId === row.sellerId ? { ...r, adminStatus: next } : r)));
    } catch {
      showToast("Failed to update", "error");
    }
  };

  const saveGuardrails = async () => {
    setSavingGuardrails(true);
    try {
      const res = await adminBestOffersApi.updateGuardrails({
        minPlatformMargin: Number(guardrails.minPlatformMargin || 0),
        minSellerPayoutPct: Number(guardrails.minSellerPayoutPct || 0),
        allowCouponStacking: Boolean(guardrails.allowCouponStacking),
        commissionBase: guardrails.commissionBase,
      });
      if (res.data?.result) setGuardrails(res.data.result);
      showToast("Offer guardrails updated", "success");
    } catch (err) {
      showToast(err?.response?.data?.message || "Failed to update guardrails", "error");
    } finally {
      setSavingGuardrails(false);
    }
  };

  const openEditor = (row) => {
    if (editingRowId === row.sellerId) {
      setEditingRowId(null);
      return;
    }
    setEditingRowId(row.sellerId);
    setRowDraft({
      sellerPct: Number(row.funding?.sellerPct ?? 100),
      platformPct: Number(row.funding?.platformPct ?? 0),
      platformDailyCap: row.budget?.platformDailyCap > 0 ? String(row.budget.platformDailyCap) : "",
      platformTotalCap: row.budget?.platformTotalCap > 0 ? String(row.budget.platformTotalCap) : "",
    });
  };

  const saveOfferConfig = async (sellerId) => {
    setSavingConfig(true);
    try {
      const res = await adminBestOffersApi.updateOfferConfig(sellerId, {
        funding: {
          sellerPct: Number(rowDraft.sellerPct),
          platformPct: Number(rowDraft.platformPct),
        },
        budget: {
          platformDailyCap: rowDraft.platformDailyCap === "" ? null : Number(rowDraft.platformDailyCap),
          platformTotalCap: rowDraft.platformTotalCap === "" ? null : Number(rowDraft.platformTotalCap),
        },
      });
      const updated = res.data?.result;
      if (updated) {
        setRows((prev) =>
          prev.map((r) =>
            r.sellerId === sellerId
              ? {
                  ...r,
                  funding: updated.funding,
                  budget: updated.budget,
                  budgetStatus: updated.budgetStatus,
                  isEnabled: updated.isEnabled,
                  exhaustedReason: updated.exhaustedReason,
                }
              : r,
          ),
        );
      }
      setEditingRowId(null);
      showToast("Funding split & budget updated", "success");
    } catch (err) {
      showToast(err?.response?.data?.message || "Failed to save offer config", "error");
    } finally {
      setSavingConfig(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Seller Best Offers &amp; Funding Guardrails</h1>
        <p className="text-sm text-slate-500">
          Manage seller-created store offers: configure platform margin protection, seller floor, funding splits, and budget caps.
        </p>
      </div>

      {/* Global Offer Guardrails */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Global Offer Guardrails</h2>
            <p className="text-xs text-slate-500">
              Protects platform margin and seller payouts across all structured offers and coupons.
            </p>
          </div>
          <button
            type="button"
            onClick={saveGuardrails}
            disabled={savingGuardrails}
            className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {savingGuardrails ? "Saving..." : "Save Guardrails"}
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Min Platform Margin (₹)</label>
            <input
              type="number"
              min="0"
              value={guardrails.minPlatformMargin}
              onChange={(e) => setGuardrails((g) => ({ ...g, minPlatformMargin: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Seller Payout Floor (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              value={guardrails.minSellerPayoutPct}
              onChange={(e) => setGuardrails((g) => ({ ...g, minSellerPayoutPct: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Commission Base</label>
            <select
              value={guardrails.commissionBase}
              onChange={(e) => setGuardrails((g) => ({ ...g, commissionBase: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm bg-white"
            >
              <option value="discounted">Discounted price (Recommended)</option>
              <option value="original">Original price</option>
            </select>
          </div>
          <label className="flex items-center gap-2 pt-5 text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={guardrails.allowCouponStacking}
              onChange={(e) => setGuardrails((g) => ({ ...g, allowCouponStacking: e.target.checked }))}
            />
            Stack admin coupons after seller offer
          </label>
        </div>
      </div>

      {/* Zone ordering & per-offer configuration */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={zoneId}
          onChange={(e) => setZoneId(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {zones.map((z) => (
            <option key={z._id} value={z._id}>
              {z.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={saveOrder}
          disabled={!dirty || saving}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {saving ? "Saving..." : "Save order"}
        </button>
        {dirty && <span className="text-xs text-amber-600">Unsaved changes</span>}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          No sellers in this zone have configured Best Offers yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row, i) => {
            const sellerPct = Number(row.funding?.sellerPct ?? 100);
            const platformPct = Number(row.funding?.platformPct ?? 0);
            const totalSpent = Number(row.budget?.platformSpent || 0);
            const totalCap = row.budget?.platformTotalCap;
            const dailySpent = Number(row.budgetStatus?.effectiveDailySpent || 0);
            const dailyCap = row.budget?.platformDailyCap;
            const isEditing = editingRowId === row.sellerId;

            return (
              <li
                key={row.sellerId}
                draggable={!isEditing}
                onDragStart={(e) => {
                  dragIndex.current = i;
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (overIndex !== i) setOverIndex(i);
                }}
                onDragLeave={() => setOverIndex((v) => (v === i ? null : v))}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = dragIndex.current;
                  dragIndex.current = null;
                  setOverIndex(null);
                  if (from != null) move(from, i);
                }}
                onDragEnd={() => {
                  dragIndex.current = null;
                  setOverIndex(null);
                }}
                className={`rounded-xl border bg-white p-3 ${
                  overIndex === i ? "border-indigo-400 bg-indigo-50" : "border-slate-200"
                } ${row.adminStatus === "hidden" || !row.isEnabled ? "opacity-75" : ""}`}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="cursor-grab select-none text-slate-400" aria-hidden="true">⋮⋮</span>
                  <span className="w-6 text-sm font-bold text-slate-400">{i + 1}</span>
                  <img src={row.image} alt="" className="h-12 w-14 rounded-lg bg-slate-100 object-cover" draggable={false} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-bold text-slate-800">{row.shopName}</p>
                      <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[11px] font-bold text-purple-800">
                        {row.offerText || "No structured discount"}
                      </span>
                      {row.exhaustedReason === "TOTAL_BUDGET_EXHAUSTED" && (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                          Budget exhausted
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Split: <strong>{sellerPct}% Seller / {platformPct}% Platform</strong>
                      {row.minOrderValue > 0 && ` · Min ₹${row.minOrderValue}`}
                      {row.perUserLimit > 0 && ` · ${row.perUserLimit}/user`}
                      {row.newUsersOnly && " · New users only"}
                      {!row.isEnabled && " · Disabled"}
                    </p>
                    {platformPct > 0 && (
                      <p className="mt-0.5 text-[11px] text-indigo-700 font-medium">
                        Platform spend: ₹{totalSpent}
                        {totalCap > 0 ? ` / ₹${totalCap} total` : " total"} · ₹{dailySpent}
                        {dailyCap > 0 ? ` / ₹${dailyCap} today` : " today"}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} className="rounded px-2 py-1 text-sm hover:bg-slate-100 disabled:opacity-30" aria-label="Move up">↑</button>
                    <button type="button" onClick={() => move(i, i + 1)} disabled={i === rows.length - 1} className="rounded px-2 py-1 text-sm hover:bg-slate-100 disabled:opacity-30" aria-label="Move down">↓</button>
                    <button
                      type="button"
                      onClick={() => openEditor(row)}
                      className="ml-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                    >
                      {isEditing ? "Close" : "Funding & Budget"}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleVisibility(row)}
                      className="ml-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold hover:bg-slate-50"
                    >
                      {row.adminStatus === "hidden" ? "Show" : "Hide"}
                    </button>
                  </div>
                </div>

                {isEditing && (
                  <div className="mt-3 border-t border-slate-100 pt-3 grid gap-3 sm:grid-cols-4 items-end">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">Seller Share (%)</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={rowDraft.sellerPct}
                        onChange={(e) => {
                          const s = Math.min(100, Math.max(0, Number(e.target.value || 0)));
                          setRowDraft((d) => ({ ...d, sellerPct: s, platformPct: 100 - s }));
                        }}
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">Platform Share (%)</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={rowDraft.platformPct}
                        onChange={(e) => {
                          const p = Math.min(100, Math.max(0, Number(e.target.value || 0)));
                          setRowDraft((d) => ({ ...d, platformPct: p, sellerPct: 100 - p }));
                        }}
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">Platform Daily Cap (₹)</label>
                      <input
                        type="number"
                        min="0"
                        placeholder="No limit"
                        value={rowDraft.platformDailyCap}
                        onChange={(e) => setRowDraft((d) => ({ ...d, platformDailyCap: e.target.value }))}
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                      />
                    </div>
                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <label className="mb-1 block text-xs font-semibold text-slate-700">Total Cap (₹)</label>
                        <input
                          type="number"
                          min="0"
                          placeholder="No limit"
                          value={rowDraft.platformTotalCap}
                          onChange={(e) => setRowDraft((d) => ({ ...d, platformTotalCap: e.target.value }))}
                          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => saveOfferConfig(row.sellerId)}
                        disabled={savingConfig}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {savingConfig ? "..." : "Save"}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default BestOffersManagement;
