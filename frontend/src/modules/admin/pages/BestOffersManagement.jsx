import React, { useEffect, useRef, useState } from "react";
import { useToast } from "@shared/components/ui/Toast";
import { adminApi } from "../services/adminApi";
import { adminBestOffersApi } from "../services/api/bestOffersApi";

const BestOffersManagement = () => {
  const { showToast } = useToast();
  const [zones, setZones] = useState([]);
  const [zoneId, setZoneId] = useState("");
  const [rows, setRows] = useState([]);
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
      .then((res) => active && setRows(res.data?.result || []))
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

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Best Offers</h1>
        <p className="text-sm text-slate-500">
          Drag sellers to set the order shown in the customer “Best Offers” section for a zone. Only sellers who have set
          up a Best Offers card appear here.
        </p>
      </div>

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
          {rows.map((row, i) => (
            <li
              key={row.sellerId}
              draggable
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
              className={`flex cursor-grab items-center gap-3 rounded-xl border bg-white p-3 active:cursor-grabbing ${
                overIndex === i ? "border-indigo-400 bg-indigo-50" : "border-slate-200"
              } ${row.adminStatus === "hidden" || !row.isEnabled ? "opacity-60" : ""}`}
            >
              <span className="select-none text-slate-400" aria-hidden="true">⋮⋮</span>
              <span className="w-6 text-sm font-bold text-slate-400">{i + 1}</span>
              <img src={row.image} alt="" className="h-12 w-14 rounded-lg bg-slate-100 object-cover" draggable={false} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-800">{row.shopName}</p>
                <p className="truncate text-xs text-slate-500">
                  {row.offerText || "No offer text"}
                  {!row.isEnabled && " · Disabled by seller"}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} className="rounded px-2 py-1 text-sm hover:bg-slate-100 disabled:opacity-30" aria-label="Move up">↑</button>
                <button type="button" onClick={() => move(i, i + 1)} disabled={i === rows.length - 1} className="rounded px-2 py-1 text-sm hover:bg-slate-100 disabled:opacity-30" aria-label="Move down">↓</button>
                <button
                  type="button"
                  onClick={() => toggleVisibility(row)}
                  className="ml-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold hover:bg-slate-50"
                >
                  {row.adminStatus === "hidden" ? "Show" : "Hide"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default BestOffersManagement;
