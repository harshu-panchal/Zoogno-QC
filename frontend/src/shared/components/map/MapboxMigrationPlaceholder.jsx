/**
 * Temporary Mapbox migration placeholder for admin/seller map tools.
 * Full polygon/zone UI ships in Phase D — see plans/mapbox_live_navigation_plan.md
 */
import { MapPin } from "lucide-react";
import {
  getMapboxAccessToken,
  isMapboxConfigured,
} from "@/core/services/mapboxLoader";

export default function MapboxMigrationPlaceholder({ title, description }) {
  const configured = isMapboxConfigured();
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
      <MapPin className="mx-auto h-8 w-8 text-green-600 mb-3" />
      <h3 className="text-sm font-black text-slate-800">{title}</h3>
      <p className="text-xs text-slate-500 mt-2 max-w-md mx-auto">{description}</p>
      {!configured && (
        <p className="text-[10px] text-amber-700 mt-3 font-mono">
          Token: {getMapboxAccessToken() ? "dummy — replace VITE_MAPBOX_ACCESS_TOKEN" : "missing"}
        </p>
      )}
    </div>
  );
}
